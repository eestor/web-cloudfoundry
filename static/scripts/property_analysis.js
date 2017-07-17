

var map = undefined;
var marker = undefined;
var formInputChangeTimeout = 0;
var formInactivityDelay = 400;

$(document).ready(function(event){
    if ($("#map").length > 0) {
        map = L.mapbox.map('map', 'mapbox.satellite')
          .setView([39.50,-98.35], 3);
    }
          
    $("#street").keypress(onFormInputChange);
    $("#city").keypress(onFormInputChange);
    $("#state").keypress(onFormInputChange);
    $("#zip").keypress(onFormInputChange);
          
    $("#street").change(onFormInputChange);
    $("#city").change(onFormInputChange);
    $("#state").change(onFormInputChange);
    $("#zip").change(onFormInputChange);
})    

function onFormInputChange(event) {
    console.log("change")
    clearTimeout(formInputChangeTimeout);
    formInputChangeTimeout = setTimeout(function(){
        console.log("running...")
        handleFormInputChange();
    }, formInactivityDelay);
}

function handleFormInputChange() {
    var street = $("#street").val();
    var city = $("#city").val();
    var state = $("#state").val();
    var zip = $("#zip").val();

    performQuery(street, city, state, zip);
}

function performQuery(street, city, state, zip) {

    if (street.length > 0 && 
        ((city.length > 0 && state.length > 0) ||
        zip.length > 0)) {

        var query = street;

        if (city.length > 0) {
            query += ", " + city;
        }
        if (state.length > 0) {
            query += ", " + state;
        }
        if (zip.length > 0) {
            query += ", " + zip;
        }

        geocoder.query(query, function(err, res) {
            // res is a GeoJSON document with geocoding matches
            console.log(err,res)
            if(err == undefined && res.latlng) {
                map.setView(res.latlng, 17);

                if (marker) {
                    marker.setLatLng(res.latlng)
                } else {

                    marker = L.marker(res.latlng, {
                        icon: L.mapbox.marker.icon({
                            'marker-color': '#0C0'
                        })
                        })
                        .addTo(map);
                }
            }
        });
    }
}