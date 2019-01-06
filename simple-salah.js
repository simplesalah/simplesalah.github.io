const locationKey = 'simplesalah_locations';
const lastLocationKey = 'simplesalah_last_location';

function initAutocomplete() {
    let input = document.getElementById('location-input');
    let autocomplete = new google.maps.places.Autocomplete(input, {placeIdOnly: true, types: ["(regions)"]});
    let geocoder = new google.maps.Geocoder;

    autocomplete.addListener('place_changed', function() {
        clearTimings(); //there's a delay before new timings load. During it, we want to display blank instead of incorrect timings.
        document.getElementById('currLocationButton').click(); //close dropdown menu

        let place = autocomplete.getPlace();
        if (!place.place_id) { 
            alert('Error: please select from suggestions.'); 
            return; 
        }

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
        fetch(`https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${Math.round(new Date()/1000)}&key=***`)
            .then(function(response) {
                return response.json();
            })
            .then(function(tzJson) {
                //FIXME: add error handling for failed requests, like ACCESS_DENIED from GCP. (E.g. w/ misconfigured referrer restrictions.)
                let tz = tzJson.timeZoneId;
                addLocation(placeName, lat, lng, tz);
                loadLocation(placeName);
            });
        });
    });
}

function addLocation(name, lat, lng, tz) {
    let locations = JSON.parse(localStorage.getItem(locationKey));
    if (locations === null) locations = {}; 
    locations[name] = {'name': name, 'lat': lat, 'lng': lng, 'tz': tz};
    localStorage.setItem(locationKey, JSON.stringify(locations));
    populateLocations();
}

function removeLocation(name) {
    let locations = JSON.parse(localStorage.getItem(locationKey));
    delete locations[name];
    localStorage.setItem(locationKey, JSON.stringify(locations));
    document.getElementById('currLocationButton').click(); //re-open menu (for visible effect of it never closing). kludge FIXME?
    populateLocations();
    if (name == document.getElementById('currLocationButton').innerText) {
        if (Object.keys(locations).length > 0) {
            loadLocation(Object.keys(locations)[0]);
        }  
        else {
            clearAllLocations();
        }
    }
}

function loadLocation(name) { 
    let locations = JSON.parse(localStorage.getItem(locationKey));

    if (name === null || !(name in locations)) 
        return; 

    let loc = locations[name]; 
    let dt = luxon.DateTime.local().setZone(loc.tz); 

    //paint timings
    redrawTimings(loc, dt);

    //update last location 
    localStorage.setItem(lastLocationKey, loc.name);

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
    let lastLocationName = localStorage.getItem(lastLocationKey);
    if (lastLocationName !== null) { 
        loadLocation(lastLocationName);
    }
}

function populateLocations() {
    let locations = JSON.parse(localStorage.getItem(locationKey));
    //if empty or null, display Add loc box? 
    document.getElementById('locationDropdownElements').innerHTML = ''; //Is this the most UI-friendly? Or diff & add? FIXME
    for (let name in locations) {
        if (locations.hasOwnProperty(name)) {
            addDropdownLoc(name);
        }
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

function addDropdownLoc(name) {
    let newLoc = createDropdownLoc(name);
    let locElements = document.getElementById('locationDropdownElements');
    locElements.appendChild(newLoc);
}

function createDropdownLoc(name) {
    let removeButtonIcon = document.createElement('span');
    removeButtonIcon.setAttribute('class', 'fas fa-minus-circle');

    let removeButton = document.createElement('span');
    removeButton.setAttribute('style', 'color: Tomato;');
    removeButton.setAttribute('class', 'float-right ml-1');
    removeButton.setAttribute('onclick', `removeLocation("${name}")`);
    removeButton.appendChild(removeButtonIcon);

    let locLink = document.createElement('a');
    locLink.appendChild(document.createTextNode(name));
    locLink.setAttribute('onclick', `loadLocation("${name}")`);

    let dropdownItem = document.createElement('span');
    dropdownItem.appendChild(locLink);
    dropdownItem.appendChild(removeButton);
    dropdownItem.setAttribute('class', 'dropdown-item');
    return dropdownItem; 
}

function removeObsoleteValues() {
    obsoleteLocalStorage = ['city_name'];
    for (let i=0; i<obsoleteLocalStorage.length; i++) {
        localStorage.removeItem(obsoleteLocalStorage[i]);
    }
    obsoleteCookies = ['city_name'];
    for (let i=0; i<obsoleteCookies.length; i++) {
        document.cookie = obsoleteCookies[i] +'=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    }
}