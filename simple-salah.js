const locationKey = 'simplesalah_locations_v2';
const lastLocationKey = 'simplesalah_last_location_v2';
const settingsKey = 'simplesalah_settings'; 
const methodsEnum = Object.freeze({
    'ISNA': 'ISNA (default)',
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
    initAutocomplete();
    setInterval(loadLastLocation, 60000);
    redrawLocationsDropdown();
    removeObsoleteValues();

    let locations = JSON.parse(localStorage.getItem(locationKey));
    if (locations === null || locations === []) {
        $('#currLocationButton').dropdown('toggle');
    }
}

function setEventHandlers() {
    document.getElementById("clearAllLocs").onclick = clearAllLocations;
    $('#settingsModal').on('show.bs.modal', loadSettings);
    $('#settingsSaveButton').on('click', saveSettings);
    $('#locationsDropdown').on('shown.bs.dropdown', function () {
        document.getElementById('location-input').focus();
    });
    $('#locationsDropdown').on('hidden.bs.dropdown', function () {
        document.getElementById('location-input').value = '';
    });
    $('#autoDetectLoc').on('click', autoDetectLocation);
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
    let autocomplete = new google.maps.places.Autocomplete(input, {fields: ['place_id', 'name', 'types'], types: ["(regions)"]});
    let geocoder = new google.maps.Geocoder;

    autocomplete.addListener('place_changed', function() {
        let place = autocomplete.getPlace();
        if (!place.place_id) { 
            alert('ERROR: Please select from Google suggestions. They take a few seconds to load.'); 
            return; 
        }

        replaceTimingsWithLoadingIcon(); //there's a delay before new timings load.
        document.getElementById('currLocationButton').click(); //close dropdown menu
        document.getElementById('location-input').value = '';

        let placeName = place.name; 

        //get latitude & longitude from Geocoding API
        geocoder.geocode({'placeId': place.place_id}, async function (results, status) {
            if (status !== 'OK') {
                displayAlert(`Geocoder failed. Please contact support. Error status: "${status}"`);
                return;
            }
            let lat = results[0].geometry.location.lat(); 
            let lng = results[0].geometry.location.lng(); 

            let tz = await getTimezone(lat, lng); 
            saveAndLoadLocation(placeName, lat, lng, tz); 

        });
    });
}

function saveAndLoadLocation(locationName, lat, lng, tz) {
    let locIndex = addLocation(locationName, lat, lng, tz);
    loadLocation(locIndex);
}

/** Returns index of new item. */
function addLocation(name, lat, lng, tz) {
    if (!name || !lat || !lng || !tz) 
        throw '[addLocation] missing input parameters';
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
    let settings = JSON.parse(localStorage.getItem(settingsKey)) || defaultSettings;

    if (locIndex === null || isNaN(locIndex) || locIndex >= locations.length) //TODO also return if not an int. 
        return; 

    let loc = locations[locIndex]; 
    let dt = luxon.DateTime.local().setZone(loc.tz); 

    //paint timings
    redrawTimings(loc, dt, settings.fajr_isha, settings.asr_shafii, settings.asr_hanafi);

    //update last location 
    localStorage.setItem(lastLocationKey, locIndex);

    //update dropdown label 
    document.getElementById('currLocationButton').innerText = loc.name;

    //update timestamp 
    document.getElementById('timeCalculated').innerText = `${dt.weekdayShort} ${dt.monthShort} ${dt.day}, ${dt.year}`;
}

function redrawTimings(loc, dt, fajrIshaMethod, asrShafii, asrHanafi) {

    let tzOffset = dt.offset/60; 

    //calculate times
    let timings = {};
    if (fajrIshaMethod === '15_18') {

        prayTimes.adjust( {fajr: 15, asr: 'Standard', isha: 15} );
        let shafii_15 = prayTimes.getTimes(new Date(), [loc.lat,loc.lng], tzOffset, 0, '12h');

        timings.fajr_15 = shafii_15.fajr;
        timings.sunrise = shafii_15.sunrise;
        timings.dhuhr = shafii_15.dhuhr;
        timings.asr_shafii = shafii_15.asr;
        timings.maghrib = shafii_15.maghrib;
        timings.isha_15 = shafii_15.isha;

        prayTimes.adjust( {fajr: 18, asr: 'Hanafi', isha: 18} );
        let hanafi_18 = prayTimes.getTimes(new Date(), [loc.lat,loc.lng], tzOffset, 0, '12h');

        timings.fajr_18 = hanafi_18.fajr;
        timings.asr_hanafi = hanafi_18.asr;
        timings.isha_18 = hanafi_18.isha;

        if (asrShafii && !asrHanafi) timings.asr = shafii_15.asr;
        if (asrHanafi && !asrShafii) timings.asr = hanafi_18.asr; 
    }
    else {
        prayTimes.setMethod(fajrIshaMethod);

        let calc; 

        if (asrHanafi) {
            prayTimes.adjust( {asr: 'Hanafi'} );
            calc = prayTimes.getTimes(new Date(), [loc.lat,loc.lng], tzOffset, 0, '12h');
            
            if (!asrShafii) 
                timings.asr = calc.asr;
            else
                timings.asr_hanafi = calc.asr;
        }
        
        if (asrShafii) {
            prayTimes.adjust( {asr: 'Standard'} );
            calc = prayTimes.getTimes(new Date(), [loc.lat,loc.lng], tzOffset, 0, '12h');

            if (!asrHanafi) 
                timings.asr = calc.asr;
            else
                timings.asr_shafii = calc.asr;
        }

        if (!asrHanafi && !asrShafii)
            calc = prayTimes.getTimes(new Date(), [loc.lat,loc.lng], tzOffset, 0, '12h');

        timings.fajr = calc.fajr;
        timings.sunrise = calc.sunrise;
        timings.dhuhr = calc.dhuhr;
        timings.maghrib = calc.maghrib;
        timings.isha = calc.isha;
    }

    //update display
    if (fajrIshaMethod === '15_18') {
        document.getElementById('fajr-15_18').removeAttribute('style');
        document.getElementById('fajr').setAttribute('style', 'display: none');
        document.getElementById('fajr-15').innerText = timings.fajr_15;
        document.getElementById('fajr-18').innerText = timings.fajr_18;

        document.getElementById('isha-15_18').removeAttribute('style');
        document.getElementById('isha').setAttribute('style', 'display: none');
        document.getElementById('isha-15').innerText = timings.isha_15;
        document.getElementById('isha-18').innerText = timings.isha_18;
    }
    else {
        document.getElementById('fajr').removeAttribute('style');
        document.getElementById('fajr-15_18').setAttribute('style', 'display: none');
        document.getElementById('fajr').innerText = timings.fajr;

        document.getElementById('isha').removeAttribute('style');
        document.getElementById('isha-15_18').setAttribute('style', 'display: none');
        document.getElementById('isha').innerText = timings.isha;
    }
    if (asrHanafi && asrShafii) {
        document.getElementById('asr-both').removeAttribute('style');
        document.getElementById('asr').setAttribute('style', 'display: none');
        document.getElementById('asr-shafi').innerText = timings.asr_shafii;
        document.getElementById('asr-hanafi').innerText = timings.asr_hanafi;
    }
    else {
        document.getElementById('asr').removeAttribute('style');
        document.getElementById('asr-both').setAttribute('style', 'display: none');
        document.getElementById('asr').innerText = timings.asr || '';
    }
    document.getElementById('sunrise').innerText = timings.sunrise;
    document.getElementById('dhuhr').innerText = timings.dhuhr;
    document.getElementById('maghrib').innerText = timings.maghrib;
}

function clearTimings() {
    document.getElementById('fajr').innerHTML = '';
    document.getElementById('fajr-15').innerHTML = '';
    document.getElementById('fajr-18').innerHTML = '';
    document.getElementById('sunrise').innerHTML = '';
    document.getElementById('dhuhr').innerHTML = '';
    document.getElementById('asr').innerHTML = '';
    document.getElementById('asr-shafi').innerHTML = '';
    document.getElementById('asr-hanafi').innerHTML = '';
    document.getElementById('maghrib').innerHTML = '';
    document.getElementById('isha').innerHTML = '';
    document.getElementById('isha-15').innerHTML = '';
    document.getElementById('isha-18').innerHTML = '';
}

function replaceTimingsWithLoadingIcon() {
    let loadingIcon = '<div class="spinner-grow spinner-grow-sm" role="status"><span class="sr-only">Loading...</span></div>';
    document.getElementById('fajr').innerHTML = loadingIcon;
    document.getElementById('fajr-15').innerHTML = loadingIcon;
    document.getElementById('fajr-18').innerHTML = loadingIcon;
    document.getElementById('sunrise').innerHTML = loadingIcon;
    document.getElementById('dhuhr').innerHTML = loadingIcon;
    document.getElementById('asr').innerHTML = loadingIcon;
    document.getElementById('asr-shafi').innerHTML = loadingIcon;
    document.getElementById('asr-hanafi').innerHTML = loadingIcon;
    document.getElementById('maghrib').innerHTML = loadingIcon;
    document.getElementById('isha').innerHTML = loadingIcon;
    document.getElementById('isha-15').innerHTML = loadingIcon;
    document.getElementById('isha-18').innerHTML = loadingIcon;
}

function loadLastLocation() {
    let lastLocationIndex = localStorage.getItem(lastLocationKey);
    if (lastLocationIndex !== null) { 
        lastLocationIndex = parseInt(lastLocationIndex);
        loadLocation(lastLocationIndex);
    }
    return lastLocationIndex; 
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

function displayAlert(message, alertType, timeLength) {
    if (!timeLength) timeLength = 3000; 

    let alert = document.createElement('div');
    alert.innerText = message;
    alert.innerHTML += '<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>';
    
    alert.setAttribute('class', `alert alert-${alertType} fade show`);
    document.getElementById('alertArea').appendChild(alert);

    setTimeout(function(){ $(".alert").alert('close'); }, timeLength);
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

function clearLoadedCity() {
    document.getElementById('currLocationButton').innerText = 'Select location';
    document.getElementById('timeCalculated').innerText = '';
    clearTimings();
}

function clearAllLocations() {
    localStorage.removeItem(locationKey);
    localStorage.removeItem(lastLocationKey);
    document.getElementById('locationDropdownElements').innerHTML = '';
    clearLoadedCity(); 
}

function addDropdownLoc(name, locIndex) {
    let newLoc = createDropdownLoc(name, locIndex);
    let locElements = document.getElementById('locationDropdownElements');
    locElements.appendChild(newLoc);
}

function createDropdownLoc(name, locIndex) {
    locIndex = parseInt(locIndex); //XSS protection

    let removeButtonIcon = document.createElement('span');
    removeButtonIcon.setAttribute('class', 'fas fa-times');

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

async function getTimezone(lat, lng) {
    let r = await fetch(`https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${Math.round(new Date()/1000)}&key=AIzaSyDw6WD3hCxyQ4WpC6g_NUBF28Gg8s02h0k`);
    r = await r.json(); 
    return r.timeZoneId; 
    //TODO: should this have error handling for failed requests, like ACCESS_DENIED from GCP? (E.g. w/ misconfigured referrer restrictions.)
}

// Returns city name. Throws exception if unsuccessful.
async function reverseGeocode(lat, lng) {
    let r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=AIzaSyCw-JUDOB05RMZutf7U62UOqtDaDA74CT0&result_type=locality`);
    r = await r.json(); 
    return r.results[0].formatted_address; //results could be empty..
}

function autoDetectLocation() {

    async function success(position) {
        const lat  = position.coords.latitude;
        const lng = position.coords.longitude;

        let locationName; 
        try {
            locationName = await reverseGeocode(lat, lng); 
        } catch {
            locationName = `${lat}, ${lng}`; 
        }

        let tz = await getTimezone(lat, lng); 

        saveAndLoadLocation(locationName, lat, lng, tz);
    }

    function error(e) {
        if (e.code === 1) {
            displayAlert(`Permission denied. Please enable geolocation in your settings.`, 'danger', 60000);
        }
        else {
            displayAlert(`Unable to retrieve location. Error: "${e.message}"`, 'danger', 10000);
        }
        let loadedIndex = loadLastLocation();
        if (loadedIndex === null) {
            clearLoadedCity(); 
        }
    }

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(success, error);
        document.getElementById('currLocationButton').innerText = "Detecting location...";
        replaceTimingsWithLoadingIcon();
    }
    else {
        displayAlert("Geolocation not supported on this browser.", "danger");
    }
}
