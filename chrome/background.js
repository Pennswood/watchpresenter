//Copyright 2014 Google Inc. All Rights Reserved.
//
//Licensed under the Apache License, Version 2.0 (the "License");
//you may not use this file except in compliance with the License.
//You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
//Unless required by applicable law or agreed to in writing, software
//distributed under the License is distributed on an "AS IS" BASIS,
//WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//See the License for the specific language governing permissions and
//limitations under the License.


var apiUp = false;
var URLRegexp = /http[s]:\/\/docs\.google\.com.*\/presentation/i;
var checkLaunched = false;
var modalRegistrationTabId;

function registerCallback(registrationId) {
    console.log("on registerCallback");
    var lastError = chrome.runtime.lastError;
    if (lastError) {
        // When the registration fails, handle the error and retry the
        // registration later.
        console.log("Error while registering: " + lastError);
        return;
    }
    console.log("Sending registration ID...");
    // Send the registration ID to your application server.
    sendRegistrationId(registrationId, function (succeed) {
        // Once the registration ID is received by your server,
        // set the flag such that register will not be invoked
        // next time when the app starts up.
        if (succeed) {
            console.log("Registration successful (" + succeed + "). Saving to storage...");
            chrome.storage.local.set({
                registered: true
            });
        }
        releaseModal(succeed);
    });
}

function sendRegistrationId(regId, callback) {
    console.log("Sending registration ID: " + regId);
    gapi.client.registration.register({
        'regId': regId
    }).execute(
        function (response) {
            console.log("sendRegistrationId response: " + response);
            callback(true);
        }
    );
}

function afterAPIUp() {
    console.log("Checking if already registered");
    chrome.storage.local.get("registered", function (result) {
        // If already registered, bail out.
        if (result["registered"])
            console.log("Looks like already registered, but we'll try again anyway");
        else
            console.log("Not registered yet. Registering...");
        // Up to 100 senders are allowed.
        var senderIds = ["122248338560"];
        chrome.gcm.register(senderIds, registerCallback);
    });
    apiUp = true;
}


function loadGoogleAPI() {
    //load Google's javascript client libraries
    window.gapi_onload = authorize;
    loadScript('https://apis.google.com/js/client.js');
}


function requestAuthTokenInteractive() {
    console.log("Requesting auth token interactively");
    //oauth2 auth
    chrome.tabs.insertCSS({
        file: "watchpresenter.css"
    });
    chrome.tabs.executeScript({
        file: "modal_log-in.js"
    });
}

function releaseModal(success) {
    if (modalRegistrationTabId) {
        chrome.tabs.sendMessage(modalRegistrationTabId, {
            greeting: "finishLoading",
            success: success
        });
        modalRegistrationTabId = null;
    } else {
        console.log("Error: releasing modal but no modalTabId found");
    }
}

function interactiveRequestAuthToken(tabId) {
    if (modalRegistrationTabId) {
        console.log("Already modal registration for tab ID: " + modalRegistrationTabId);
    } else {
        modalRegistrationTabId = tabId;
        chrome.identity.getAuthToken({
                'interactive': true
            },
            function (token) {
                var success = false;
                if (chrome.runtime.lastError) {
                    console.log("Failed to get Auth token on interactive mode (Error)");
                    releaseModal(false);
                } else {
                    if (token) {
                        console.log("Valid token found: " + token);
                        loadGoogleAPI();
                        success = true;
                    } else {
                        console.log("Failed to get Auth token on interactive mode");
                        releaseModal(false);
                    }
                }

            }
        );
    }
}


function checkAuthStatus(tabId) {
    chrome.pageAction.show(tabId);


    chrome.identity.getAuthToken({
            'interactive': false
        },
        function (token) {
            if (token) {
                console.log("Valid token found: " + token);
                loadGoogleAPI();
            } else {
                console.log("Valid token not found");
                chrome.storage.local.set({
                    registered: false
                });
                requestAuthTokenInteractive();
            }
        }
    );
}

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    console.log("Match: " + tab.url.match(/.*#openModal$/));
    if (changeInfo.status == "complete" && tab.url && tab.url.match(/http[s]:\/\/docs\.google\.com.*\/presentation/i)) {
        console.log("URL match");
        if (!(tab.url.match(/.*#openModal$/))) {
            if (checkLaunched == false) {
                window.setTimeout(function () {
                    checkAuthStatus(tabId)
                }, 1000);
            } else {
                console.log("checkAuthStatus already scheduled");
            }

        } else {
            console.log("We are already in openModal");
        }
    } else {
        chrome.pageAction.hide(tabId);
    }
});


chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    console.log(sender.tab ?
        "from a content script:" + sender.tab.url :
        "from the extension");
    if (request.greeting == "authorize") {
        var tabId = null;
        if (sender.tab) {
            interactiveRequestAuthToken(sender.tab.id);
        } else {
            chrome.tabs.query({
                    currentWindow: true,
                    active: true
                },
                function (tabArray) {
                    interactiveRequestAuthToken(tabArray[0].id);
                });
        }
    }

});


chrome.gcm.onMessage.addListener(function (message) {
    console.log("Message received: '" + message + "'");
    chrome.tabs.getSelected(null, function (tab) {
        if (tab.url.match(URLRegexp)) {
            chrome.tabs.executeScript({
                file: "slide_switcher.js"
            });
        }
    });
});




//function init() {
//      var apiName = 'registration'
//      var apiVersion = 'v1'
//      var apiRoot = 'https://watchpresenterpublic.appspot.com/_ah/api';
//      var callback = function() {
//          
//          
//          chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
//              console.log("Token retrieved: " + token);
//              gapi.auth.setToken(token);
//              afterAPIUp();
//           });
//      }
//      gapi.client.load(apiName, apiVersion, callback, apiRoot);
//    }


//var head = document.getElementsByTagName('head')[0];
//var script = document.createElement('script');
//script.type = 'text/javascript';
//script.src = "https://apis.google.com/js/client.js?onload=init";
//head.appendChild(script);







function loadScript(url) {
    var request = new XMLHttpRequest();

    request.onreadystatechange = function () {
        if (request.readyState !== 4) {
            return;
        }

        if (request.status !== 200) {
            return;
        }

        eval(request.responseText);
    };

    request.open('GET', url);
    request.send();
}

function authorize() {
    console.log("on authorize()");
    gapi.auth.authorize({
            client_id: '1048948725539-2fvnptbb4vqh2dqsfgnm32c2caqg32h8.apps.googleusercontent.com',
            immediate: true,
            scope: 'https://www.googleapis.com/auth/userinfo.email'
        },
        function (token) {
            if (token.access_token && !token.error) {
                gapi.client.load('registration', 'v1', afterAPIUp, 'https://watchpresenterpublic.appspot.com/_ah/api');
            } else {
                chrome.storage.local.set({
                    registered: false
                });
            }

        }
    );
}

if (apiUp) {
    //load Google's javascript client libraries
    window.gapi_onload = authorize;
    loadScript('https://apis.google.com/js/client.js');
}