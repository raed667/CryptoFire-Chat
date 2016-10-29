/**
 * Created by Lenovo on 29-Oct-16.
 */

/**
 * Returns URL query string
 */
function getQueryParams(qs) {
    qs = qs.split('+').join(' ');

    var params = {},
        tokens,
        re = /[?&]?([^=]+)=([^&]*)/g;

    while (tokens = re.exec(qs)) {
        params[decodeURIComponent(tokens[1])] = decodeURIComponent(tokens[2]);
    }
    return params;
}

/**
 *
 * @param byteArray
 * @returns {string}
 */
function byteArrayToBase64(byteArray) {
    var binaryString = "";
    for (var i = 0; i < byteArray.byteLength; i++) {
        binaryString += String.fromCharCode(byteArray[i]);
    }
    var base64String = window.btoa(binaryString);
    return base64String;
}

/**
 *
 * @param base64String
 * @returns {Uint8Array}
 */
function base64ToByteArray(base64String) {
    var binaryString = window.atob(base64String);
    var byteArray = new Uint8Array(binaryString.length);
    for (var i = 0; i < binaryString.length; i++) {
        byteArray[i] += binaryString.charCodeAt(i);
    }
    return byteArray;
}

/**
 *
 * @param s
 * @returns {*}
 */
function stringToByteArray(s) {
    if ("TextEncoder" in window) {
        encoder = new window.TextEncoder;
        return encoder.encode(s);
    }

    // Otherwise, fall back to 7-bit ASCII only
    var result = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) {
        result[i] = s.charCodeAt(i);
    }
    return result;
}