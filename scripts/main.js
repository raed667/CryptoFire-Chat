'use strict';

/** Global variables **/
// chat room id
let room = "";

/** CRYPTO **/
var myKeys = {
    public: null,
    private: null
};

var theirPublicKey = undefined;
// 'host' or 'guest'
var role;

// message to be sent
var message = {};
/** ********** **/

// Initializes FriendlyChat.
function FriendlyChat() {
    this.checkSetup();

    // Shortcuts to DOM Elements.
    this.messageList = document.getElementById('messages');
    this.messageForm = document.getElementById('message-form');
    this.messageInput = document.getElementById('message');
    this.submitButton = document.getElementById('submit');
    this.userPic = document.getElementById('user-pic');
    this.userName = document.getElementById('user-name');
    this.signInButton = document.getElementById('sign-in');
    this.signOutButton = document.getElementById('sign-out');
    this.signInSnackbar = document.getElementById('must-signin-snackbar');
    this.room = document.getElementById('room');
    this.signInMessage = document.getElementById('signInMessage');
    document.getElementById("oldPassword").setAttribute("hidden", true);
    document.getElementById("resetIdButton").setAttribute("hidden", true);

    // Saves message on form submit.
    this.messageForm.addEventListener('submit', this.saveMessage.bind(this));
    this.signOutButton.addEventListener('click', this.signOut.bind(this));
    this.signInButton.addEventListener('click', this.signIn.bind(this));

    // Toggle for the button.
    var buttonTogglingHandler = this.toggleButton.bind(this);
    this.messageInput.addEventListener('keyup', buttonTogglingHandler);
    this.messageInput.addEventListener('change', buttonTogglingHandler);

    // Get room name
    room = getQueryParams(document.location.search).n;
    if (room != undefined && room.length > 4) {
        this.room.innerHTML = '(' + room + ')';
    }

    this.initFirebase();
}

// Sets up shortcuts to Firebase features and initiate firebase auth.
FriendlyChat.prototype.initFirebase = function () {
    // Shortcuts to Firebase SDK features.
    this.auth = firebase.auth();
    this.database = firebase.database();
    this.storage = firebase.storage();
    // Initiates Firebase auth and listen to auth state changes.
    this.auth.onAuthStateChanged(this.onAuthStateChanged.bind(this));
};

// Loads chat messages history and listens for upcoming ones.
FriendlyChat.prototype.loadMessages = function () {
    // Reference to the /messages/ database path.
    this.messagesRef = this.database.ref('messages');
    // Make sure we remove all previous listeners.
    this.messagesRef.off();
    // Loads the last 12 messages and listen for new ones.
    var user = firebase.auth().currentUser;

    var setMessage = function (data) {
        var val = data.val();
        if (val.name != user.displayName) {
            decryptMessage(val, data.key, this);
        }
        this.database.ref('messages/' + data.key).remove();

    }.bind(this);

    this.messagesRef.orderByChild("room").equalTo(room).on('child_added', setMessage);
    this.messagesRef.orderByChild("room").equalTo(room).on('child_changed', setMessage);
};

// Saves a new message on the Firebase DB.
FriendlyChat.prototype.saveMessage = function (e) {
    e.preventDefault();
    // Check that the user entered a message and is signed in.
    if (this.messageInput.value && this.checkSignedInWithMessage()) {
        // ENCRYPT AND SEND
        encryptMessage(this.messageInput.value, this);
    }
};

// Signs-in Friendly Chat.
FriendlyChat.prototype.signIn = function () {
    // Sign in Firebase using popup auth and Google as the identity provider.
    var provider = new firebase.auth.GoogleAuthProvider();
    this.auth.signInWithPopup(provider);
};

// Signs-out of Friendly Chat.
FriendlyChat.prototype.signOut = function () {
    // Sign out of Firebase.
    this.auth.signOut();
};

function uploadKey(userId, publicKey, encryptedPrivateKey, salt, iv, passwordHash) {
    firebase.database().ref('users/' + userId).set({
        publicKey: publicKey,
        salt: salt,
        encryptedPrivateKey: encryptedPrivateKey,
        iv: iv,
        password: passwordHash
    });
}

FriendlyChat.prototype.showNewRoomModal = function (message) {
    if (message === "full") {
        document.getElementById('newMessage').innerHTML = "This room is full, check another one.";
    }

    //Get random some empty rooms
    firebase.database().ref('/rooms/').once('value').then(function (snapshot) {
        let count = 0;
        snapshot.forEach(function (childSnapshot) {
            if (++count < 4 && (childSnapshot.val().user1 && !childSnapshot.val().user2)) {
                var url = "<a id='" + childSnapshot.key + "'>" + childSnapshot.key + "</a>, ";
                document.getElementById('rooms').innerHTML += url;
                document.getElementById(childSnapshot.key).setAttribute("href", "./?n=" + childSnapshot.key);
            }
        });
    });

    const dialog = document.getElementById('newRoomModal');
    if (!dialog.showModal) {
        dialogPolyfill.registerDialog(dialog);
    }
    dialog.showModal();

    // Create room
    document.getElementById('createNewRoom').addEventListener('click', function () {
        var randomRoomName = chance.word({syllables: 3});
        firebase.database().ref('rooms/' + randomRoomName).set({
            user1: firebase.auth().currentUser.uid
        }).then(function () {
            window.location = window.location + "?n=" + randomRoomName;
        });
    });
};

FriendlyChat.prototype.showPasswordModal = function () {

    /// in a room
    const dialog = document.getElementById('encryptionModal');
    var progressBar = document.getElementById("passwordProgress");
    progressBar.setAttribute('hidden', 'true');

    if (!dialog.showModal) {
        dialogPolyfill.registerDialog(dialog);
    }

    dialog.showModal();
    var appScope = this;
    var user = firebase.auth().currentUser;
    var dbUser = undefined; // stored hash from db

    //Check if user is in DB
    this.database.ref('users').child(user.uid).once('value', function (snapshot) {
        if (snapshot.val() !== null) {
            dbUser = snapshot.val();

            //console.debug(snapshot.val());
            // Verify hash
            document.getElementById("oldPassword").removeAttribute("hidden");
            document.getElementById("resetIdButton").removeAttribute("hidden");
        }

        document.getElementById('resetIdButton').addEventListener('click', function () {
            appScope.database.ref('users/' + user.uid).remove();
            document.getElementById("status").innerHTML = "Deleting keys...";
            document.getElementById("oldPassword").setAttribute("hidden", 'true');
            document.getElementById("resetIdButton").setAttribute("hidden", 'true');
            progressBar.setAttribute('hidden', 'true');
            document.getElementById("passwordSubmitButton").setAttribute("disabled", 'true');

            setTimeout(function () {
                document.getElementById("status").innerHTML = "";
                document.getElementById("passwordSubmitButton").removeAttribute("disabled");
                location.reload();
            }, 2000);
        });

        dialog.querySelector('#passwordSubmitButton').addEventListener('click', function () {
            var passwordField = document.getElementById("encryptionPassword");
            var userPassword = passwordField.value;

            passwordField.setAttribute("disabled", "disabled");
            document.getElementById("passwordSubmitButton").setAttribute("disabled", 'true');
            //console.debug(passwordField.value);
            progressBar.removeAttribute('hidden');

            document.getElementById("status").innerHTML = "Hashing password...";

            // if new -> add hash
            if (dbUser === undefined || dbUser.password === undefined) {
                console.log("new key");

                TwinBcrypt.hash(userPassword, 15,
                    function (p) {
                        // show progress
                        document.getElementById("passwordProgress").MaterialProgress.setProgress(parseInt(100 * p));
                    },
                    function (hash) {
                        /// SEND HASH TO FIREBASE
                        if (hash && appScope.checkSignedInWithMessage()) {
                            document.getElementById("status").innerHTML = "";
                        }
                        /// Generate keyPair
                        // using "userPassword"
                        createKeyPair(userPassword, user.uid, hash, appScope);
                    }
                );
            } else {
                /// compare password with hash
                console.log("comparing ... {" + userPassword + "}");
                TwinBcrypt.compare(userPassword, dbUser.password,
                    function (p) {
                        document.getElementById("passwordProgress").MaterialProgress.setProgress(parseInt(100 * p));
                    },
                    function (result) {
                        // result === true
                        document.getElementById("status").innerHTML = "";
                        if (result === true) {
                            // decrypt privateKey
                            decryptPrivateKey(dbUser.encryptedPrivateKey, userPassword, dbUser.salt, dbUser.iv, dbUser.publicKey, appScope);
                            // Colse dialog
                            dialog.close();
                        } else {
                            document.getElementById("status").innerHTML = "<span class='red'>Password mismatch, try again.</span>";
                            passwordField.removeAttribute("disabled");
                            document.getElementById("passwordSubmitButton").removeAttribute("disabled");
                        }
                    });
            }
        });
    });
};


document.getElementById("encryptionPassword").addEventListener("keyup", function (event) {
    event.preventDefault();
    if (event.keyCode == 13) {
        document.getElementById("passwordSubmitButton").click();
    }
});


function showIdentityChangeMessage(oldId, newId) {
    var container = document.createElement('div');

    container.innerHTML = '<div class="container"><div class="spacing"></div><div>Your interlocutor has a new id: <span class="hash">' + sha512(newId) + '</span></div>' +
        '<div>Old: <span class="hash">' + sha512(oldId) + '</span></div>' +
        '</div>';
    //divdiv.setAttribute('id', "ID_WARN");
    document.getElementById('messages').appendChild(container);
}

// Triggers when the auth state change for instance when the user signs-in or signs-out.
FriendlyChat.prototype.onAuthStateChanged = function (user) {
    if (user) { // User is signed in!
        // Get profile pic and user's name from the Firebase user object.
        var profilePicUrl = user.photoURL;
        var userName = user.displayName;
        // Set the user's profile pic and name.
        this.userPic.style.backgroundImage = 'url(' + profilePicUrl + ')';
        this.userName.textContent = userName;
        var parentContext = this;

        if (room === undefined || room.length < 4) {
            this.showNewRoomModal();
        } else {
            // Show password modal// check if room is in db and has user 1?
            var parentScope = this;

            this.database.ref('rooms').child(room).once('value', function (snapshot) {
                if (snapshot.val() != null) {
                    console.log("room exists");
                    var roomDb = snapshot.val();

                    if (roomDb.user1 === user.uid) {
                        console.log("I'm host");
                        role = 'host';
                    } else if (roomDb.user2 === user.uid) {
                        console.log("I'm guest");
                        role = 'guest';
                    } else if (roomDb.user2 === undefined) {
                        console.log("Guest empty");
                        // become guest
                        firebase.database().ref('rooms/' + snapshot.key + '/user2').set(user.uid).then(function () {
                            console.log("I'm now the guest");
                            role = 'guest';
                        });
                    } else if (roomDb.user2 !== undefined && roomDb.user2 !== null) {
                        console.log("Room full");
                        this.showNewRoomModal("full");
                    } else {
                        console.error("SHOULD NEVER HAPPEN!");
                    }
                } else {
                    console.log("new room");
                    // create room and become  host
                    firebase.database().ref('rooms/' + snapshot.key).set({
                        user1: user.uid
                    }).then(function () {
                        console.log("I'm now the host");
                        role = 'host';
                    });
                }

                var setOhterPublicKey = function (data) {
                    var val = data.val();
                    if (role === undefined) {
                        console.error("ROLE NOT DEFINED !");
                        return false;
                    }

                    var otherUid;
                    if (role === "host") {
                        console.log("2 :" + val.user2);
                        otherUid = val.user2;
                    } else if (role === "guest") {
                        console.log("1 :" + val.user1);
                        otherUid = val.user1;
                    }

                    var getOtherPublicKey = function (data) {
                        console.log("GETTING PUBLIC KEY");

                        var val = data.val();
                        if (val !== null) {
                            if (val.publicKey !== undefined) {
                                if (theirPublicKey != undefined) {
                                    showIdentityChangeMessage(theirPublicKey, val.publicKey);
                                }
                                theirPublicKey = val.publicKey;
                            }
                        }

                        if (theirPublicKey === undefined) {
                            parentContext.submitButton.setAttribute('disabled', 'true');
                            parentContext.messageInput.setAttribute('disabled', 'true');
                            parentContext.messageInput.setAttribute("placeholder", 'Waiting for chat partner...');
                        } else {
                            parentContext.submitButton.removeAttribute('disabled');
                            parentContext.messageInput.removeAttribute('disabled');
                            parentContext.messageInput.setAttribute("placeholder", 'Message...');
                        }

                    }.bind(this);
                    firebase.database().ref('users/' + otherUid).on('value', getOtherPublicKey);

                }.bind(this);


                firebase.database().ref('rooms/' + snapshot.key).on('value', setOhterPublicKey);


            });
            this.showPasswordModal();
        }

        const dialog = document.getElementById('LoginModal');
        if (!dialog.showModal) {
            dialogPolyfill.registerDialog(dialog);
        }
        if (dialog.open) {
            dialog.close();
        }


        // Show user's profile and sign-out button.
        this.userName.removeAttribute('hidden');
        this.userPic.removeAttribute('hidden');
        this.signOutButton.removeAttribute('hidden');

        // Hide sign-in button.
        this.signInButton.setAttribute('hidden', 'true');

        // Hide sign-in message

        this.signInMessage.setAttribute('hidden', 'true');


    } else { // User is signed out!
        // Hide user's profile and sign-out button.
        const dialog = document.getElementById('LoginModal');
        if (!dialog.showModal) {
            dialogPolyfill.registerDialog(dialog);
        }
        dialog.showModal();

        this.userName.setAttribute('hidden', 'true');
        this.userPic.setAttribute('hidden', 'true');
        this.signOutButton.setAttribute('hidden', 'true');

        // Show sign-in button.
        this.signInButton.removeAttribute('hidden');
        // show sign in message
        this.signInMessage.removeAttribute('hidden');
    }
};

// Returns true if user is signed-in. Otherwise false and displays a message.
FriendlyChat.prototype.checkSignedInWithMessage = function () {
    // Return true if the user is signed in Firebase
    if (this.auth.currentUser) {
        return true;
    }
    // Display a message to the user using a Toast.
    var data = {
        message: 'You must sign-in first',
        timeout: 2000
    };
    this.signInSnackbar.MaterialSnackbar.showSnackbar(data);
    return false;
};

// Resets the given MaterialTextField.
FriendlyChat.resetMaterialTextfield = function (element) {
    element.value = '';
    element.parentNode.MaterialTextfield.boundUpdateClassesHandler();
};

// Template for messages.
FriendlyChat.MESSAGE_TEMPLATE =
    '<div class="message-container">' +
    '<div class="spacing"><div class="pic"></div></div>' +
    '<div class="message"></div>' +
    '<div class="name"></div>' +
    '</div>';

// A loading image URL.
FriendlyChat.LOADING_IMAGE_URL = 'https://www.google.com/images/spin-32.gif';

// Displays a Message in the UI.
FriendlyChat.prototype.displayMessage = function (key, name, text, picUrl, imageUri) {
    var div = document.getElementById(key);
    // If an element for that message does not exists yet we create it.
    if (!div) {
        var container = document.createElement('div');
        container.innerHTML = FriendlyChat.MESSAGE_TEMPLATE;
        div = container.firstChild;
        div.setAttribute('id', key);
        this.messageList.appendChild(div);
    }
    if (picUrl) {
        div.querySelector('.pic').style.backgroundImage = 'url(' + picUrl + ')';
    }
    div.querySelector('.name').textContent = name;
    var messageElement = div.querySelector('.message');
    if (text) { // If the message is text.
        messageElement.textContent = text;
        // Replace all line breaks by <br>.
        messageElement.innerHTML = messageElement.innerHTML.replace(/\n/g, '<br>');
    } else if (imageUri) { // If the message is an image.
        var image = document.createElement('img');
        image.addEventListener('load', function () {
            this.messageList.scrollTop = this.messageList.scrollHeight;
        }.bind(this));
        this.setImageUrl(imageUri, image);
        messageElement.innerHTML = '';
        messageElement.appendChild(image);
    }
    // Show the card fading-in.
    setTimeout(function () {
        div.classList.add('visible')
    }, 1);

    this.messageList.scrollTop = this.messageList.scrollHeight;
    this.messageInput.focus();
};

// Enables or disables the submit button depending on the values of the input
// fields.
FriendlyChat.prototype.toggleButton = function () {
    if (this.messageInput.value) {
        this.submitButton.removeAttribute('disabled');
    } else {
        this.submitButton.setAttribute('disabled', 'true');
    }
};

// Checks that the Firebase SDK has been correctly setup and configured.
FriendlyChat.prototype.checkSetup = function () {
    if (!window.firebase || !(firebase.app instanceof Function) || !window.config) {
        window.alert('You have not configured and imported the Firebase SDK. ' +
            'Make sure you go through the codelab setup instructions.');
    } else if (config.storageBucket === '') {
        window.alert('Your Firebase Storage bucket has not been enabled. Sorry about that. This is ' +
            'actually a Firebase bug that occurs rarely. ' +
            'Please go and re-generate the Firebase initialisation snippet (step 4 of the codelab) ' +
            'and make sure the storageBucket attribute is not empty. ' +
            'You may also need to visit the Storage tab and paste the name of your bucket which is ' +
            'displayed there.');
    }
};

window.onload = function () {
    window.friendlyChat = new FriendlyChat();
};
