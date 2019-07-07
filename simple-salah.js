const locationKey = 'simplesalah_locations_v2';
const lastLocationKey = 'simplesalah_last_location_v2';
const settingsKey = 'simplesalah_settings'; 
const methodsEnum = Object.freeze({
    'ISNA': 'ISNA',
    'MWL': 'Muslim World League',
    'Makkah': 'Umm al-Qura University',
    'Karachi': 'Univ. of Islamic Sciences, Karachi',
    '15_18': 'Both 15° & 18°'
});
const defaultSettings = Object.freeze({
    fajr_isha: 'ISNA', 
    asr_shafii: true, 
    asr_hanafi: false
});

function main() {
    setEventHandlers(); 
    drawMethodSettingsMenu();
    loadLastLocation();
    redrawLocationsDropdown();
    removeObsoleteValues();
}

function setEventHandlers() {
    document.getElementById("clearAllLocs").onclick = clearAllLocations;
    $('#settingsModal').on('show.bs.modal', loadSettings);
    $('#settingsSaveButton').on('click', saveSettings);
}

function drawMethodSettingsMenu() {
    let dropdownButton = document.getElementById('fajrIshaDropdownButton');
    let elements = document.getElementById('fajrIshaDropdownElements');
    Object.keys(methodsEnum).forEach(function(key) {
        let label = methodsEnum[key];
        let a = document.createElement('a');
        a.innerText = label;
        a.onclick = function() {
            dropdownButton.innerText = label; 
            dropdownButton.setAttribute('data-settingFajrIshaSelection', key);
        };
        a.setAttribute('class', 'dropdown-item');
        a.setAttribute('href', '#');
        elements.appendChild(a);
    });
}

function initAutocomplete() {
    let input = document.getElementById('location-input');
    let autocomplete = new google.maps.places.Autocomplete(input, {placeIdOnly: true, types: ["(regions)"]});
    let geocoder = new google.maps.Geocoder;

    autocomplete.addListener('place_changed', function() {
        let place = autocomplete.getPlace();
        if (!place.place_id) { 
            alert('Error: please select from suggestions.'); 
            return; 
        }

        clearTimings(); //there's a delay before new timings load. During it, we want to display blank instead of incorrect timings.
        document.getElementById('currLocationButton').click(); //close dropdown menu

        document.getElementById('location-input').value = '';

        let placeName = place.name; 

        //get latitude & longitude from Geocoding API
        geocoder.geocode({'placeId': place.place_id}, function (results, status) {
        if (status !== 'OK') {
            window.alert('Geocoder failed due to: ' + status);
            return;
        }
        let lat = results[0].geometry.location.lat(); 
        let lng = results[0].geometry.location.lng(); 

        //get timezone from Time Zone API 
        fetch(`https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${Math.round(new Date()/1000)}&key=AIzaSyDDGqCMjZnysLB1EW4n8Ze2dOLkPPN6SjI`) //security note: accepting risk on hardcoded cred for now.
            .then(function(response) {
                return response.json();
            })
            .then(function(tzJson) {
                //FIXME: add error handling for failed requests, like ACCESS_DENIED from GCP. (E.g. w/ misconfigured referrer restrictions.)
                let tz = tzJson.timeZoneId;
                let locIndex = addLocation(placeName, lat, lng, tz);
                loadLocation(locIndex);
            });
        });
    });
}

/** Returns index of new item. */
function addLocation(name, lat, lng, tz) {
    let locations = JSON.parse(localStorage.getItem(locationKey));
    if (locations === null) locations = []; 
    let locIndex = locations.push( {'name': name, 'lat': lat, 'lng': lng, 'tz': tz} ) - 1;
    localStorage.setItem(locationKey, JSON.stringify(locations));
    redrawLocationsDropdown();
    return locIndex;
}

function removeLocation(locIndex) {
    let locations = JSON.parse(localStorage.getItem(locationKey));
    locations.splice(locIndex, 1)[0];
    localStorage.setItem(locationKey, JSON.stringify(locations)); 
    document.getElementById('currLocationButton').click(); //re-open menu (for visible effect of it never closing). kludge FIXME?
    redrawLocationsDropdown();

    let lastLocIndex = JSON.parse(localStorage.getItem(lastLocationKey));
    if (lastLocIndex == locIndex) {
        if (locations.length > 0) {
            loadLocation(0);
        }  
        else {
            clearAllLocations();
        }
    }
    else if (lastLocIndex > locIndex) {
        localStorage.setItem(lastLocationKey, lastLocIndex - 1);
    }
}

function loadLocation(locIndex) { 
    let locations = JSON.parse(localStorage.getItem(locationKey));

    if (locIndex === null || isNaN(locIndex) || locIndex >= locations.length) //TODO also return if not an int. 
        return; 

    let loc = locations[locIndex]; 
    let dt = luxon.DateTime.local().setZone(loc.tz); 

    //paint timings
    redrawTimings(loc, dt);

    //update last location 
    localStorage.setItem(lastLocationKey, locIndex);

    //update dropdown label 
    document.getElementById('currLocationButton').innerText = loc.name;

    //update timestamp 
    document.getElementById('timeCalculated').innerText = `${dt.weekdayShort} ${dt.monthShort} ${dt.day}, ${dt.year}`;
}

//FIXME: this is kludge code. Switch to dynamically generated elements instead of static table? May help with settings page. And might be cleaner.
function redrawTimings(loc, dt) {
    let tzOffset = dt.offset/60; //TODO: import Luxon here instead of in HTML? 
    let timings = JSON.stringify(prayTimes.getTimes(new Date(), [loc.lat,loc.lng], tzOffset, 0, '12h'), null, 4);

    //calculate times
    var date = new Date();
    prayTimes.adjust( {fajr: 15, asr: 'Hanafi', isha: 15} );
    var salah_times_hanafi_15 = prayTimes.getTimes(new Date(), [loc.lat,loc.lng], tzOffset, 0, '12h');
    prayTimes.adjust( {fajr: 18, asr: 'Hanafi', isha: 18} );
    var salah_times_hanafi_18 = prayTimes.getTimes(new Date(), [loc.lat,loc.lng], tzOffset, 0, '12h');
    prayTimes.adjust( {fajr: 15, asr: 'Standard', isha: 15} );
    var salah_times_shafi_15 = prayTimes.getTimes(new Date(), [loc.lat,loc.lng], tzOffset, 0, '12h');

    //update times
    document.getElementById('fajr-15').innerText = salah_times_shafi_15['fajr'];
    document.getElementById('fajr-18').innerText = salah_times_hanafi_18['fajr'];
    document.getElementById('sunrise').innerText = salah_times_shafi_15['sunrise'];
    document.getElementById('dhuhr').innerText = salah_times_shafi_15['dhuhr'];
    document.getElementById('asr-shafi').innerText = salah_times_shafi_15['asr'];
    document.getElementById('asr-hanafi').innerText = salah_times_hanafi_15['asr'];
    document.getElementById('maghrib').innerText = salah_times_shafi_15['maghrib'];
    document.getElementById('isha-15').innerText = salah_times_shafi_15['isha'];
    document.getElementById('isha-18').innerText = salah_times_hanafi_18['isha'];
}

function clearTimings() {
    document.getElementById('fajr-15').innerText = '';
    document.getElementById('fajr-18').innerText = '';
    document.getElementById('sunrise').innerText = '';
    document.getElementById('dhuhr').innerText = '';
    document.getElementById('asr-shafi').innerText = '';
    document.getElementById('asr-hanafi').innerText = '';
    document.getElementById('maghrib').innerText = '';
    document.getElementById('isha-15').innerText = '';
    document.getElementById('isha-18').innerText = '';
}

function loadLastLocation() {
    let lastLocationIndex = localStorage.getItem(lastLocationKey);
    if (lastLocationIndex !== null) { 
        lastLocationIndex = parseInt(lastLocationIndex);
        loadLocation(lastLocationIndex);
    }
}

function loadSettings() {
    let settings = JSON.parse(localStorage.getItem(settingsKey));

    if (settings === null) {
        settings = defaultSettings;
        localStorage.setItem(settingsKey, JSON.stringify(settings));
    }

    document.getElementById('fajrIshaDropdownButton').innerText = methodsEnum[settings.fajr_isha];
    document.getElementById('fajrIshaDropdownButton').setAttribute('data-settingFajrIshaSelection', settings.fajr_isha);
    document.getElementById('setting_shafii').checked = settings.asr_shafii;
    document.getElementById('setting_hanafi').checked = settings.asr_hanafi;
}

function saveSettings() {
    let settings = {
        fajr_isha: document.getElementById('fajrIshaDropdownButton').getAttribute('data-settingFajrIshaSelection'),
        asr_shafii: document.getElementById('setting_shafii').checked, 
        asr_hanafi: document.getElementById('setting_hanafi').checked
    }
    if (!methodsEnum.hasOwnProperty(settings.fajr_isha)) {
        settings.fajr_isha = defaultSettings.fajr_isha;
    }
    localStorage.setItem(settingsKey, JSON.stringify(settings));
    $('#settingsModal').modal('hide');
    displayAlert('Settings updated', 'success');
    loadLastLocation();
}

function displayAlert(message, alertType) {
    let alert = document.createElement('div');
    alert.innerText = message;
    alert.innerHTML += '<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>';
    
    alert.setAttribute('class', `alert alert-${alertType} fade show`);
    document.getElementById('alertArea').appendChild(alert);
    setTimeout(function(){ $(".alert").alert('close'); }, 3000);
}

function redrawLocationsDropdown() {
    let locations = JSON.parse(localStorage.getItem(locationKey));
    if (locations === null) {
        locations = [];
    }
    document.getElementById('locationDropdownElements').innerHTML = ''; //is this the most efficient way?
    for (let i=0; i<locations.length; i++) {
        addDropdownLoc(locations[i].name, i);  
    }
}

function clearAllLocations() {
    localStorage.removeItem(locationKey);
    localStorage.removeItem(lastLocationKey);
    document.getElementById('locationDropdownElements').innerHTML = '';
    document.getElementById('currLocationButton').innerText = 'Select location';
    document.getElementById('timeCalculated').innerText = '';
    clearTimings();
}

function addDropdownLoc(name, locIndex) {
    let newLoc = createDropdownLoc(name, locIndex);
    let locElements = document.getElementById('locationDropdownElements');
    locElements.appendChild(newLoc);
}

function createDropdownLoc(name, locIndex) {
    locIndex = parseInt(locIndex); //XSS protection

    let removeButtonIcon = document.createElement('span');
    removeButtonIcon.setAttribute('class', 'fas fa-minus-circle');

    let removeButton = document.createElement('span');
    removeButton.setAttribute('style', 'color: Tomato;');
    removeButton.setAttribute('class', 'float-right ml-1');
    removeButton.setAttribute('onclick', `removeLocation(${locIndex})`);
    removeButton.appendChild(removeButtonIcon);

    let locLink = document.createElement('a');
    locLink.appendChild(document.createTextNode(name));
    locLink.setAttribute('onclick', `loadLocation(${locIndex})`);

    let dropdownItem = document.createElement('span');
    dropdownItem.appendChild(locLink);
    dropdownItem.appendChild(removeButton);
    dropdownItem.setAttribute('class', 'dropdown-item');
    return dropdownItem; 
}

function removeObsoleteValues() {
    obsoleteLocalStorage = ['city_name','simplesalah_locations','simplesalah_last_location'];
    for (let i=0; i<obsoleteLocalStorage.length; i++) {
        localStorage.removeItem(obsoleteLocalStorage[i]);
    }
    obsoleteCookies = ['city_name'];
    for (let i=0; i<obsoleteCookies.length; i++) {
        document.cookie = obsoleteCookies[i] +'=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    }
}