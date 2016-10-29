/**
 *
 * @param passphraseString
 * @param saltBase64
 * @returns {Promise.<TResult>}
 */
function convertPassphraseToKey(passphraseString, saltBase64) {
    // Loading
    console.log("Generating key...");

    var iterations = 1000000;   // Longer is slower... hence stronger
    var saltBytes = base64ToByteArray(saltBase64); //
    var passphraseBytes = stringToByteArray(passphraseString);

    // deriveKey needs to be given a base key. This is just a
    // CryptoKey that represents the starting passphrase.
    return window.crypto.subtle.importKey(
        "raw", passphraseBytes, {name: "PBKDF2"}, false, ["deriveKey"]
    ).then(function (baseKey) {
        return window.crypto.subtle.deriveKey(
            // Firefox currently only supports SHA-1 with PBKDF2
            {name: "PBKDF2", salt: saltBytes, iterations: iterations, hash: "SHA-1"},
            baseKey,
            {name: "AES-CBC", length: 256}, // Resulting key type we want
            true,  // exportable
            ["encrypt", "decrypt"]
        );
    }).catch(function (err) {
        alert("Could not generate a key from passphrase '" + passphraseString + "': " + err.message);
    });
}

/**
 *
 * @param passphrase
 * @param userId
 * @param passwordHash
 * @param parentScope
 */
function createKeyPair(passphrase, userId, passwordHash, parentScope) {
    window.crypto.subtle.generateKey(
        {
            name: "RSASSA-PKCS1-v1_5",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]), // 65537
            hash: {name: "SHA-256"}
        },
        true,
        ["sign", "verify"]
    ).then(function (keyPair) {

        // Export public key
        window.crypto.subtle.exportKey("spki", keyPair.publicKey
        ).then(function (spkiBuffer) {
            var spkiBytes = new Uint8Array(spkiBuffer);
            var spkiString = byteArrayToBase64(spkiBytes);
            myKeys.public = spkiString;
        }).catch(function (err) {
            alert("Could not export public key: " + err.message);
        });

        // Export Private key
        window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey
        ).then(function (pkcs8Buffer) {

            var pkcs8Bytes = new Uint8Array(pkcs8Buffer);
            var pkcs8String = byteArrayToBase64(pkcs8Bytes);
            myKeys.private = pkcs8String;
            console.info("CLEAR (bef)");
            console.debug(pkcs8String);

            // We load currently existing chant messages.
            parentScope.loadMessages();

            /// Encrypt private key and upload
            encryptPrivateKey(myKeys.private, passphrase, userId, passwordHash);

        }).catch(function (err) {
            alert("Could not export private key: " + err.message);
        });

    }).catch(function (err) {
        alert("Could not generate key pair: " + err.message);
    });
}

/**
 *
 * @param inputPlaintext
 * @param parent
 */
function encryptMessage(inputPlaintext, parent) {

    // var destPublicKey = theirPublicKey; // @temporary @todo
    var spkiBytes = base64ToByteArray(theirPublicKey);

    // Start by getting the RSA public key for encrypting session key
    window.crypto.subtle.importKey(
        "spki",
        spkiBytes,
        {name: "RSA-OAEP", hash: "SHA-256"},
        false,
        ["encrypt"]
    ).then(function (publicKey) {
        // Now we need to create a random session key for encrypting
        // the actual plaintext.
        return window.crypto.subtle.generateKey(
            {name: "AES-CBC", length: 256},
            true,
            ["encrypt", "decrypt"]
        ).then(function (sessionKey) {
            // We need to do two things with the session key:
            //    Use it to encrypt the selected plaintext file
            //    Encrypt the session key with the public key

            // Part 1 - Read the file and encrypt it with the session key.
            var input = inputPlaintext; //document.getElementById("plaintext").value;
            // console.debug(inputPlaintext);
            encryptReadFile(input); // See definition below

            function encryptReadFile(inputPlaintext) {
                var ivBytes = window.crypto.getRandomValues(new Uint8Array(16));
                var plaintextBytes = new TextEncoder("utf-8").encode(inputPlaintext);
                window.crypto.subtle.encrypt(
                    {name: "AES-CBC", iv: ivBytes}, sessionKey, plaintextBytes
                ).then(function (ciphertextBuffer) {
                    // Build a Blob with the 16-byte IV followed by the ciphertext
                    var toBeSent = [ivBytes, new Uint8Array(ciphertextBuffer)];
                    message = {"iv": byteArrayToBase64(toBeSent[0]), "ciphertext": byteArrayToBase64(toBeSent[1])};
                }).catch(function (err) {
                    alert("Could not encrypt the plaintext: " + err.message);
                });
            }

            // Part 2 - encrypt the session key with the public key. This
            //          requires exporting it first.
            window.crypto.subtle.exportKey(
                "raw", sessionKey
            ).then(function (sessionKeyBuffer) {
                // Encrypt the session key in the buffer, save the encrypted
                // key in the keyBox element.
                window.crypto.subtle.encrypt(
                    {name: "RSA-OAEP"},
                    publicKey, // from closure
                    sessionKeyBuffer
                ).then(function (encryptedSessionKeyBuffer) {

                    var encryptedSessionKeyBytes = new Uint8Array(encryptedSessionKeyBuffer);
                    var encryptedSessionKeyBase64 = byteArrayToBase64(encryptedSessionKeyBytes);
                    message.sessionkey = encryptedSessionKeyBase64;

                    var messageString = JSON.stringify(message);

                    var currentUser = parent.auth.currentUser;
                    // Add a new message entry to the Firebase Database.
                    parent.database.ref('messages').push({
                        name: currentUser.displayName,
                        text: messageString, // encrypted
                        photoUrl: currentUser.photoURL || '/images/profile_placeholder.png',
                        email: currentUser.email,
                        room: room
                    }).then(function () {
                        // Clear message text field and SEND button state.
                        var user = firebase.auth().currentUser;
                        parent.displayMessage("me" + Math.random().toString(36).substring(7), user.userName, inputPlaintext, user.photoURL, '');

                        FriendlyChat.resetMaterialTextfield(parent.messageInput);
                        parent.toggleButton();
                    }.bind(parent)).catch(function (error) {
                        console.error('Error writing new message to Firebase Database', error);
                    });

                }).catch(function (err) {
                    alert("Could not encrypt session key. :" + err);
                });
            }).catch(function (err) {
                alert("Could not export random session key:" + err.message);
            });
        }).catch(function (err) {
            alert("Could not generate random session key: " + err.message);
        });
    }).catch(function (err) {
        alert("Could not import public key: " + err.message);
    });
}

/**
 *
 * @param val
 * @param data
 * @param parentScope
 */
function decryptMessage(val, data, parentScope) {
    var pkcs8Bytes = base64ToByteArray(myKeys.private);
    ///  console.log("my key",myKeys.private);

    // We need a CryptoKey object holding the private key to get started
    window.crypto.subtle.importKey(
        "pkcs8",
        pkcs8Bytes,
        {name: "RSA-OAEP", hash: "SHA-256"},
        false,
        ["decrypt"]
    ).then(function (privateKey) {

        console.log("We're here..");

        // Now use the private key to decrypt the session key
        var message = JSON.parse(val.text);
        console.log("Recieved");
        console.debug(message);

        var encryptedSessionKeyBase64 = message.sessionkey;  //keyBox.value;
        var encryptedSessionKeyBytes = base64ToByteArray(encryptedSessionKeyBase64);

        window.crypto.subtle.decrypt(
            {name: "RSA-OAEP"}, privateKey, encryptedSessionKeyBytes
        ).then(function (sessionKeyBuffer) {

            window.crypto.subtle.importKey(
                // We can't use the session key until it is in a CryptoKey object
                "raw", sessionKeyBuffer, {name: "AES-CBC", length: 256}, false, ["decrypt"]
            ).then(function (sessionKey) {

                // Finally, we can read and decrypt the ciphertext file
                var ciphertextBytes = base64ToByteArray(message.ciphertext);
                var ivBytes = base64ToByteArray(message.iv);
                window.crypto.subtle.decrypt(
                    {name: "AES-CBC", iv: ivBytes}, sessionKey, ciphertextBytes
                ).then(function (plaintextBuffer) {

                    var plaintextDecypted = String.fromCharCode.apply(null, new Uint8Array(plaintextBuffer));
                    console.log("PLAIN :", plaintextDecypted);
                    parentScope.displayMessage(data, val.name, plaintextDecypted, val.photoUrl, val.imageUrl);

                }).catch(function (err) {
                    alert("Could not decrypt the ciphertext: " + err.message);
                });
            }).catch(function (err) {
                alert("Error importing session key: " + err.message);
            });
        }).catch(function (err) {
            alert("Error decrypting session key: " + err.message);
        });
    }).catch(function (err) {
        alert("Could not import private key: " + err)
    });
}


/**
 *
 * @param privateKey
 * @param passphrase
 * @param userId
 */
function encryptPrivateKey(privateKey, passphrase, userId, passwordHash) {

    var salt = window.crypto.getRandomValues(new Uint8Array(16));
    var base64Salt = byteArrayToBase64(salt);
    convertPassphraseToKey(passphrase, base64Salt).then(function (key) {

        console.log('Encrypting private key...');
        var plaintextBytes = base64ToByteArray(privateKey);

        /* CALL AES CBC ENCRYPT */
        var iv = window.crypto.getRandomValues(new Uint8Array(16));
        var ivBase64 = byteArrayToBase64(iv);

        window.crypto.subtle.encrypt(
            {name: "AES-CBC", iv: iv},
            key,
            plaintextBytes
        ).then(function (ciphertextBuf) {

            var ciphertextBytes = new Uint8Array(ciphertextBuf);
            var base64Ciphertext = byteArrayToBase64(ciphertextBytes);

            console.info("ENCRYPTED (encryption):");
            console.debug(base64Ciphertext);

            uploadKey(userId, myKeys.public, base64Ciphertext, base64Salt, ivBase64, passwordHash);
            document.getElementById('encryptionModal').close();

        }).catch(function (err) {
            alert("Encryption error: " + err.message);
        });
    });
}


/**
 *
 * @param encryptedPrivaeKey
 * @param passphrase
 * @param base64Salt
 * @param ivBase64
 * @param publicKey
 * @param parentScope
 */
function decryptPrivateKey(encryptedPrivateKey, passphrase, base64Salt, ivBase64, publicKey, parentScope) {

    console.info("ENCRYPTED (decryption):");
    console.debug(encryptedPrivateKey);

    var salt = base64ToByteArray(base64Salt);

    convertPassphraseToKey(passphrase, base64Salt).then(function (key) {

        var ciphertextBytes = base64ToByteArray(encryptedPrivateKey);

        /// CALL AES CBC ENCRYPT
        var iv = base64ToByteArray(ivBase64);

        window.crypto.subtle.decrypt(
            {name: "AES-CBC", iv: iv},
            key,
            ciphertextBytes
        ).then(function (plaintextBuf) {

            // Encode ciphertext to base 64 and put in Ciphertext field
            var plaintextBytes = new Uint8Array(plaintextBuf);
            var base64plaintext = byteArrayToBase64(plaintextBytes);

            myKeys.private = base64plaintext;
            myKeys.public = publicKey;

            console.info("CLEAR (after)");
            console.debug(myKeys.private);

            console.log("Done: Decrypting of private key");

            // We load currently existing chant messages.
            parentScope.loadMessages();

        }).catch(function (err) {
            alert("Decryption error: " + err.message);
        });
    });
}