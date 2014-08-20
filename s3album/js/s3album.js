var Google_App_Token = null;
var AWS_Bucket_Obj = null;
var AWS_RoleArn = 'arn:aws:iam::334172838169:role/Test_Role';
var AWS_Region = 'ap-southeast-1';
var AWS_BucketName = 'wod-photos-all';
var AWS_MaxKeys = 10;
var AWS_SignedUrl_Expires = 900;
var AWS_Marker = null;
var AWS_Data = null;

var myAlbums = {};
var pages = [];
var currentAlbum;
var marker;
var currentPage;
var primaryEmail;

/*-------------------- Google Login code  (Start)----------------------*/

(function () {
    var po = document.createElement('script');
    po.type = 'text/javascript';
    po.async = true;
    //po.src = 'https://apis.google.com/js/client:plusone.js';
    po.src = 'https://plus.google.com/js/client:plusone.js';
    var s = document.getElementsByTagName('script')[0];
    s.parentNode.insertBefore(po, s);

})();

function signinCallback(authResult) {
    if (authResult['status']['signed_in']) {
        // Update the app to reflect a signed in user
        // Hide the sign-in button now that the user is authorized, for example:
        document.getElementById('signinButton').setAttribute('style', 'display: none');
        document.getElementById('signoffButton').setAttribute('style', 'display: true');
        Google_App_Token = authResult.id_token;
        gapi.client.load('plus', 'v1', gplusProfile);
    } else {
        // Update the app to reflect a signed out user
        // Possible error values:
        //   "user_signed_out" - User is signed-out
        //   "access_denied" - User denied access to your app
        //   "immediate_failed" - Could not automatically log in the user
        console.log('Sign-in state: ' + authResult['error']);
    }
}

function gplusProfile() {

    gapi.client.plus.people.get({
        'userId': 'me'
    }).execute(function (profile) {
        for (var i = 0; i < profile.emails.length; i++) {
            if (profile.emails[i].type === 'account')
                primaryEmail = profile.emails[i].value;
        }
        $('#userID').empty();
        $('#nav-profile').append($('<img class=\"profile\" src=\"' + profile.image.url + '\">'));
        $('#userID').append($('<div>' + profile.displayName + '</div>'));
        $('#userID').append($('<div id=\"email\">' + primaryEmail + '</div>'));
    });
    setTimeout(function () {
        profilePanelInit();
    }, 2000);
    setTimeout(function () {
        welcomePage();
    }, 0);
    setTimeout(function () {
        loadAlbums();
    }, 1000);

}

/*-------------------- Google Login code  (Start)----------------------*/

/*-------------------- Code for AWS (Start)----------------------*/

function loadAlbums() {
    AWS.config.credentials = new AWS.WebIdentityCredentials({
        RoleArn: AWS_RoleArn,
        WebIdentityToken: Google_App_Token
    });
    AWS.config.region = AWS_Region;
    AWS_Bucket_Obj = new AWS.S3({
        params: {
            Bucket: AWS_BucketName
        }
    });
    AWS_Bucket_Obj.getSignedUrl('getObject', {
        Bucket: AWS_BucketName,
        Key: 'users/' + primaryEmail + '.xml', // Location in the bucket where we keep the user specific album access XMLs
    }, function (err, url) {
        if (err) {
            console.log(err, err.stack); // an error occurred
            $('#wait').replaceWith("Some thing went wrong, Please reload the page.");
        } else {
            var xmlhttp = new XMLHttpRequest();
            xmlhttp.open("GET", url, false);
            xmlhttp.send();
            var albumXML = xmlhttp.responseXML;
            // Make an (sudo) async function call
            setTimeout(function () {
                xmlParser(albumXML);
            }, 0);
        }
    });
}

function loadAlbumObj(albumName) {
    AWS_Bucket_Obj.listObjects({
        MaxKeys: AWS_MaxKeys,
        Prefix: myAlbums[albumName].Thumbs,
        Delimiter: '/',
        Marker: AWS_Marker
    }, function (err, data) {
        if (err) {
            updateStatus('loadError');
            console.log(err);
        } else {
            AWS_Data = data;
            setTimeout(function () {
                loadGallery(albumName);
            }, 0);
            $('#status').empty();

        }
    });
}

function getObjectUrl(key) {
    var params = {
        Bucket: AWS_BucketName,
        Key: key,
        Expires: AWS_SignedUrl_Expires
    };
    return AWS_Bucket_Obj.getSignedUrl('getObject', params);
}

/*-------------------- Code for AWS (End)----------------------*/

/*-------------------- Code for Albums (Start)----------------------*/

function xmlParser(xmlDoc) {
    var node = xmlDoc.getElementsByTagName("album");
    var len = node.length;
    while (len > 0) {
        len--;
        if (node[len].hasAttribute('thumbs') && node[len].hasAttribute('large') && node[len].hasAttribute('name')) {
            var albumName = node[len].getAttribute('name');
            myAlbums[albumName] = {};
            myAlbums[albumName].Thumbs = node[len].getAttribute('thumbs');
            myAlbums[albumName].Large = node[len].getAttribute('large');
        }
    }
    console.log(jQuery.isEmptyObject(myAlbums));
    if (!jQuery.isEmptyObject(myAlbums)) {

        setTimeout(function () {
            showAlbumList();
        }, 0);
    } else {
        updateStatus('noAlbums');
        //$('#welcome-page').css('display', 'none');
    }
}

function showAlbumList() {
    for (var albumName in myAlbums) {
        $('#album-list').append($('<button id=\"' + albumName + '\" onClick="buttonClicked(this)">' + albumName + '</button>'));
    }
    setTimeout(function () {
        albumListPanelInit();
    }, 2000);
}

function buttonClicked(obj) {
    if (obj.id == 'more') {
        AWS_Marker = marker;
        loadAlbumObj(currentAlbum);
    } else if (obj.value == 'page') {
        if (parseInt(obj.id) != currentPage) {
            AWS_Marker = pages[obj.id - 1];
            loadAlbumObj(currentAlbum);
        }
    } else {
        AWS_Marker = null;
        setTimeout(function () {
            resetGallery(currentAlbum = obj.id);
            loadAlbumObj(currentAlbum);
        }, 0);
        setTimeout(function () {
            toggleAlbumPanel();
        }, 500);
    }
}

function resetGallery(albumName) {
    while (pages.length > 0) {
        pages.pop();
    }
    $('#album-name').empty();
    $('#album-name').append(albumName);
    $('#album-gallery').css('display', 'block');
    $('#pages').empty();
}

function loadGallery(albumName) {
    var linksContainer = $('#links');
    linksContainer.empty();
    for (var i = 1; i < AWS_Data.Contents.length; i++) {
        $('<a/>')
            .append($('<img>').prop('src', getObjectUrl(AWS_Data.Contents[i].Key)))
            .prop('href', getObjectUrl(AWS_Data.Contents[i].Key.replace(myAlbums[albumName].Thumbs, myAlbums[albumName].Large)))
            .prop('title', '')
            .attr('data-gallery', '')
            .appendTo(linksContainer);
    }
    if (pages.indexOf(AWS_Data.Marker) < 0) {
        currentPage = pages.push(AWS_Data.Marker);
        marker = AWS_Data.NextMarker;
        $('#pages').append($('<button value="page" id=\"' + currentPage + '\" onClick="buttonClicked(this)">' + currentPage + '</button>'));
    } else {
        currentPage = pages.indexOf(AWS_Data.Marker) + 1;
    }
    $('#' + currentPage).focus();
    if (AWS_Data.IsTruncated === true) {
        $('#more').prop("disabled", false);
    } else
        $('#more').prop("disabled", true);
}

function welcomePage() {
    $('#login-page').css('display', 'none');
    $('#welcome-page').css('display', 'block');
}

/*-------------------- Code for Albums (End)----------------------*/

/*-------------------- Generic (End)----------------------*/

function updateStatus(code) {
    var statusDiv = $('#status');
    $('#welcome').css('display', 'none');
    statusDiv.empty();
    if (code == 'noAlbums') {
        statusDiv.append($('<p>Opps! looks like you dont have access to any albums!<br>please login using a different &nbsp Google ID &nbsp or contact the admin at &nbsp <a id="email"> shadow.on.fire@gmail.com </a></p>'));
    } else if (code == 'loadError') {
        statusDiv.append($('<p>Could not load objects from S3!,<br>Please reload the page or contact the &nbsp <a id="email" href="mailto:shadow.on.fire@gmail.com"> Admin </a></p>'));
    } else {
        statusDiv.append($('<p>There seems to be some problem...<br>Please reload the page or contact the &nbsp <a id="email" href="mailto:shadow.on.fire@gmail.com"> Admin </a></p>'));
    }
}

/*-------------------- Generic (End)----------------------*/

/*-------------------- Google Signoff code  (Start)----------------------*/

/**
 * Calls the OAuth2 endpoint to disconnect the app for the user.
 */
function signoffButton() {
    // Revoke the access token.
    $.ajax({
        type: 'GET',
        url: 'https://accounts.google.com/o/oauth2/revoke?token=' + gapi.auth.getToken().access_token,
        async: false,
        contentType: 'application/json',
        dataType: 'jsonp',
        success: function (result) {
            console.log('revoke response: ' + result);
            location.reload(true);
        },
        error: function (e) {
            console.log(e);
        }
    });
}

/*-------------------- Google Signoff code  (End)----------------------*/

/*-------------------- EXPANDABLE PANELS  (Start)----------------------*/
//panel animate speed in milliseconds 
var accordian = false; //set panels to behave like an accordian, with one panel only ever open at once      
var listPanelheight, dataPanelheight;

//Initialise collapsible panels

function profilePanelInit() {
    $('#profileDataContainer').css('display', 'block');
    dataPanelheight = parseInt($('#profileDataContainer').find('.expandable-panel-content').css('height')) + 2;
    $('#profileDataContainer').find('.expandable-panel-content').css('margin-top', -dataPanelheight);
}

function albumListPanelInit() {
    $('#albumListContainer').css('display', 'block');
    listPanelheight = parseInt($('#albumListContainer').find('.expandable-panel-content').css('height'));
    $('#albumListContainer').find('.expandable-panel-content').css('margin-top', -listPanelheight);
    $('.menu-icon').css('background-color', '#696');
    $('#welcome-page').css('display', 'none');
    setTimeout(function () {
        toggleAlbumPanel();
    }, 500);
}

function toggleAlbumPanel() {
    console.log('profil data margin : ' + parseInt($('#profileDataContainer').find('.expandable-panel-content').css('margin-top')));
    if (parseInt($('#profileDataContainer').find('.expandable-panel-content').css('margin-top')) === 0) {
        toggleProfilePanel();
    }
    var obj = $('#albumListContainer').find('.expandable-panel-content');
    toggle(obj, listPanelheight);
}

function toggleProfilePanel() {
    console.log('album list margin : ' + parseInt($('#albumListContainer').find('.expandable-panel-content').css('margin-top')));
    if (parseInt($('#albumListContainer').find('.expandable-panel-content').css('margin-top')) === 0) {
        if ($('#albumListContainer').css('display') != 'none') {
            toggleAlbumPanel();
        }
    }
    var obj = $('#profileDataContainer').find('.expandable-panel-content');
    toggle(obj, dataPanelheight);
}

function toggle(obj, height) {
    var panelspeed = 200;
    if (parseInt(obj.css('margin-top')) < 0) {
        obj.clearQueue();
        obj.stop();
        obj.animate({
            'margin-top': 0
        }, panelspeed);
    } else {
        obj.clearQueue();
        obj.stop();
        obj.animate({
            'margin-top': (height * -1)
        }, panelspeed);
    }
}

/*-------------------- EXPANDABLE PANELS  (End)----------------------*/

/*-------------------- Help Stuff  (Start)----------------------*/

/*
     AWS_AccessKeyId : Not required if using Web identity federation
     AWS_SecretAccessKey : Not required if using Web identity federation
     AWS_Region : The region in which the bucket is located can be like -> 'ap-southeast-1' or -> 'Singapore' 
     AWS_BucketName : The bucket which we are trying to access
     AWS_MaxKeys : How many objects will be retrived (include folders and items)
     AWS_Prefix prefix of the bojects to be fetched ex: 'Photos/', default is root
     AWS_SignedUrl_Expires : This is the default value in seconds after which the SignedUrl expires
     */

/*-------------------- Help Stuff  (End)----------------------*/