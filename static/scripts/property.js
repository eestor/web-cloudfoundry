var io;
var id = undefined;
var debugOutput = "";

var imageMapRenderer = undefined;
var currentOverlay = undefined;
var watsonOverlays = [];
var watsonTextOverlays = [];

var iframeEmbed = undefined;
var iframeWrapper = undefined;
var mapInstance = undefined;


var baseURL = getS3BaseURLForProperty();
var cornersFile = baseURL + "odm-original/odm_orthophoto/odm_orthphoto_corners.txt"
var orthophoto = baseURL + "odm-original/odm_orthophoto/odm_orthophoto.png"
var geoModel = baseURL + "odm-original/odm_georeferencing/odm_georeferencing_model_geo.txt"
var geoModel = baseURL + "odm-original/odm_georeferencing/odm_georeferencing_model_geo.txt"
var watsonDataURL = baseURL + "analysis/analysis.json"

var cornersTxt = "";
var geoModelTxt = "";
var utm = "";
var utmCenter = "";
var wgs84 = "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs";

var watsonData = undefined;
var currentImageURL = undefined;
var showWatsonData = false;

function getS3BaseURLForProperty() {
    var tokens = window.location.pathname.split("/")
    return "https://s3-api.us-geo.objectstorage.softlayer.net/yuma310/" + tokens[tokens.length-1] + "/"
}

$(document).ready(function(event){
    $(".startProcessing").click(beginAnalysis);
    $(".thumbnail").click(showfullImage);

    $("#closeButton").click(toggleSidebar);
    $("#hamburger").click(toggleSidebar);

    $("#costPerSquare").bind('keyup input', calculateSummary);
    $("#costPerFlashing").bind('keyup input', calculateSummary);
    $("#costPerGutter").bind('keyup input', calculateSummary);

    calculateSummary();

    $('a[data-toggle="tab"]').on('show.bs.tab', toggleReconstructionIframe);
    $('a[data-toggle="tab"]').on('shown.bs.tab', toggleContent);

    $('#showWatsonData').change(toggleWatsonOverlays);

    if($('#showWatsonData').val() == "COMPLETE") loadWatsonVRData();

    var urltokens = window.location.href.split("/");
    id = urltokens[urltokens.length-1];
    
    if (id) {
        io = io();

        io.on('connect', function(){
            console.log("socket connect")

            if (id) {
                io.emit('upgrade', id);
            }
        });


        io.on('disconnect', function(){
            console.log('socket disconnect');
        });


        io.on('data', function(data){
            appendProgress(data);
            /*var feedback = $("#output");
            var innerHTML = feedback.html();
            innerHTML += "<br/>" + data.toString();
            feedback.html(innerHTML);

            feedback.scrollTop(feedback.prop("scrollHeight"));
        
            console.log(data)
            */
        });

        io.on('analyticsComplete', function(data) {

            console.log("analyticsComplete");
            window.location = window.location.href;
        })

    }

     $('.lazy').lazyload();
        $('.thumbnails').scroll(function(event){
                console.log("scroll")
                $('.lazy').lazyload();  
            })
});

function appendProgress(input) {
    if (editor) {
        var scrollTop = editor.getScrollTop();
        var scrollHeight = editor.getScrollHeight();
        var offsetHeight = editor.getDomNode().offsetHeight;
        var modOffsetHeight = (1.9*offsetHeight);
        var value = editor.getValue();
        var scroll = false;
        if (scrollTop + modOffsetHeight >= (scrollHeight-offsetHeight)) {
            scroll = true;
        }
        
        //force scrolling for now
        scroll = true;

        debugOutput += "\n" + input;
        editor.setValue(debugOutput);

        if (scroll) {
            var targetScrollTop = scrollHeight-modOffsetHeight;
            editor.setScrollTop(targetScrollTop);
        }
        
    }
}

function toggleSidebar(event) {
    var visible = $(".sidebar").hasClass("offscreen")
    if (!visible) { 
        $(".sidebar").addClass("offscreen")
        $(".body").addClass("fullSize")
        $(".heading *").addClass("invisible");
    }
    else {
        $(".sidebar").removeClass("offscreen")
        $(".body").removeClass("fullSize")
        $(".heading *").removeClass("invisible");
    }
    $("#hamburger").removeClass("active");
    forceResizeEvent();
    event.preventDefault();
    return false;
}

function forceResizeEvent() {


    setTimeout(function(){
        window.dispatchEvent(new Event('resize'));
    },300);
}


function showfullImage(event) {
    console.log("showFullImage")

    var target = $(event.currentTarget);

    $(".thumbnails").removeClass("fullSize").addClass("singleColumn");
    $(".fullsizeContainer").removeClass("hidden");
    //$("#fullSizeImage").attr("src", target.attr("img-original"))
    //setTimeout(function(){
        requestImage(target.attr("img-original"))
    //}, 250);
}

function beginAnalysis(event) {

    var actionURL = window.location.href+"/beginAnalysis";
    var form = $("#beginAnalysisForm");
    form.attr("action", actionURL);
    form.attr("method", "POST");
    form.submit();
}

function requestImage(url) {

    clearImage();
    $(".imageProgressContainer .progress-bar").css("width","0%");
    $(".imageProgressContainer").removeClass("hidden");
    currentImageURL = url;
    
    var xmlHTTP = new XMLHttpRequest();
    xmlHTTP.open('GET', url,true);
    xmlHTTP.responseType = 'arraybuffer';
    xmlHTTP.onload = function(e) {
        var blob = new Blob([this.response]);
        displayImage(window.URL.createObjectURL(blob))
        console.log("complete")
    };
    xmlHTTP.onprogress = function(e) {
        var progress = parseInt((e.loaded / e.total) * 100);
        console.log("progress", progress)
        $(".imageProgressContainer .progress-bar").css("width",progress+"%");
    };
    xmlHTTP.onloadstart = function() {
        //thisImg.completedPercentage = 0;
        console.log("onloadstart")
    };
    xmlHTTP.send();
}

function parseFileName(url) {
    var tokens = url.split("/");
    return tokens[tokens.length-1];
}

function displayImage(url) {
    console.log(url);

    var initializedRenderer = false
    var fileName = parseFileName(currentImageURL);
    

    var size = {};
    var image = new Image();
    image.src = url;
    image.onload = function() { 
        size.width = image.width;
        size.height = image.height;


        var zoom = Math.ceil(($('#image-renderer').width()/size.width)*5);
        //console.log(size.width, $('#image-renderer').width(), zoom);
        if (imageMapRenderer == undefined) {
            imageMapRenderer = L.map('image-renderer', {
                minZoom: 1,
                maxZoom: 5,
                center: [0, 0],
                zoom: zoom,
                crs: L.CRS.Simple
            });
            initializedRenderer = true;
        }

        var southWest = imageMapRenderer.unproject([0, size.height], imageMapRenderer.getMaxZoom()-1);
        var northEast = imageMapRenderer.unproject([size.width, 0], imageMapRenderer.getMaxZoom()-1);
        var bounds = new L.LatLngBounds(southWest, northEast);

        currentOverlay = L.imageOverlay(url, bounds).addTo(imageMapRenderer);
        imageMapRenderer.setMaxBounds(bounds);
        

        if (watsonData && watsonData[fileName]){
            var vr = watsonData[fileName];
            if (vr && vr.tiles) {
                var rows = vr.tiles;
                var tileSize = getTileSize(vr);
                for (var r=0; r<rows.length; r++) {
                    var row = rows[r];
                    for (var c=0; c<row.length; c++){
                        var cell = row[c];
                        var score = getAnalysisScore(cell) * 100;
                        var x = tileSize * c
                        var y = tileSize * r;
                        var overlay = getOverlayForScore(score);

                        if (overlay) {
                            var southWest = imageMapRenderer.unproject([x, y+cell.size.height], imageMapRenderer.getMaxZoom()-1);
                            var northEast = imageMapRenderer.unproject([x+cell.size.width, y], imageMapRenderer.getMaxZoom()-1);
                            var bounds = new L.LatLngBounds(southWest, northEast);

                            var overlay = L.imageOverlay(overlay, bounds).addTo(imageMapRenderer);
                            overlay.setOpacity(showWatsonData ? 1 : 0);
                            watsonOverlays.push(overlay);


                            /*var center = imageMapRenderer.unproject([x+(cell.size.width/2)-20, y+(cell.size.height/2)-10], imageMapRenderer.getMaxZoom()-1);

                            var marker = new L.LabelOverlay(center,score.toFixed(2).toString());
                            if (showWatsonData) {
                                imageMapRenderer.addLayer(marker);
                            }
                            watsonTextOverlays.push(marker);*/
                        }
                        
                    }
                }
            }
        }

        if (!initializedRenderer) {
            setTimeout(function(event){
                imageMapRenderer.setView([0, 0], zoom);
            },100)
        }


        setTimeout(function(event){
            $(".imageProgressContainer").addClass("hidden");
        },300)
                

        image.onload = undefined;
        image = undefined;
    }
}

function clearImage() {
    if (currentOverlay) {
        imageMapRenderer.removeLayer(currentOverlay)
        for (var x=0; x<watsonOverlays.length; x++) {
            imageMapRenderer.removeLayer(watsonOverlays[x]);
        }
        for (var x=0; x<watsonTextOverlays.length; x++) {
            imageMapRenderer.removeLayer(watsonTextOverlays[x]);
        }
        currentOverlay = undefined;
        currentImageURL = undefined;
        watsonOverlays = [];
        watsonTextOverlays = [];
    }
}

function toggleReconstructionIframe(event) {
    var target = $(event.currentTarget);

    if (iframeEmbed == undefined) {
        iframeEmbed = $("#3D-reconstruction-iframe")
        iframeWrapper = $("#iframeWrapper")
    }

    if (target.text() == "3D Reconstruction") {
        //show 3D reconstruction
        if (iframeEmbed.attr("src") == undefined) {
            iframeEmbed.attr("src", iframeEmbed.attr("frame-src"));
        } else {
            iframeWrapper.appendTo($("#3D-reconstruction"))
        }
    } else {
        //hide it
        if (iframeEmbed.attr("src") != undefined) {
            iframeWrapper.detach();
        }
    }
}


function toggleContent(event) {
    var target = $(event.currentTarget);

    if (target.text() == "Map") {
        if (mapInstance == undefined) {
            renderPropertyMap();
        }
    }
    forceResizeEvent();
}


function renderPropertyMap() {
    mapInstance = L.mapbox.map('ortho-map-instance', 'mapbox.satellite')
          .setView([39.50,-98.35], 3);

    loadOrthoPhoto();
}


function loadOrthoPhoto() {
    

    var self = this;

    var getCorners = function(callback) {
            $.ajax( cornersFile )
            .done(function(result) {
                cornersTxt = result;
                callback();
            })
            .fail(function(err) {
                callback(err);
            })
        };
    
    var getModel = function(callback) {
            $.ajax( geoModel )
            .done(function(result) {
                geoModelTxt = result;
                callback();
            })
            .fail(function(err) {
                callback(err);
            })
        }

    async.parallel([getCorners, getModel], 
        function(err) {
            if(err) {
                console.log(err);
            }
            else {
                console.log("convert projection to latlon...") 

                parseGeoModel();
                var corners = cornersTxt.split(" ");
                var tlx = Number(corners[0]); 
                var tly = Number(corners[3]); 
                var brx = Number(corners[2]); 
                var bry = Number(corners[1]);

                var topLeftUnprojected = [tlx + Number(utmCenter[0]), tly + Number(utmCenter[1])];
                var bottomRightUnprojected = [brx + Number(utmCenter[0]), bry + Number(utmCenter[1])]; 
                var tl = proj4(utm,wgs84,topLeftUnprojected);
                var br = proj4(utm,wgs84,bottomRightUnprojected);

                var northEast = [br[1], tl[0]];
                var southWest = [tl[1], br[0]];


                var bounds = new L.LatLngBounds(southWest, northEast);

                var orthoOverlay = L.imageOverlay(orthophoto, bounds).addTo(mapInstance);
                var center = proj4(utm,wgs84,[utmCenter[0], utmCenter[1]]);
                mapInstance.setView([center[1], center[0]], 18)    
            }
        });
}

function parseGeoModel() {
    var tokens = geoModelTxt.split("\n");
    utmCenter = tokens[1].split(" ");
    var utmTokens = tokens[0].split(" ");
    utm = "+proj=" + utmTokens[1] + " +zone=" + utmTokens[2]; 

    //sample:
    //  WGS84 UTM 14N
    //  554705 3299278
}





function loadWatsonVRData() {
    $.ajax( watsonDataURL )
    .done(function(result) {
        watsonData = result;
    })
    .fail(function(err) {
        console.log(err);
    })
}



function getAnalysisScore(cellData) {
    if (cellData.analysis && cellData.analysis.images && cellData.analysis.images.length > 0) {
        var image = cellData.analysis.images[0];
        if (image && image.classifiers && image.classifiers.length > 0) {
            var classifier = cellData.analysis.images[0].classifiers[0]
            if (classifier && classifier.classes && classifier.classes.length > 0) {
                var classification = classifier.classes[0];
                return classification.score.toFixed(3);
            }
        } 
    }
    return 0
}

function getOverlayForScore(score) {
    var result = undefined;
    /*if (score >= 15 && score < 30) {
        result = "/static/images/overlay/yellow.png";
    } else if (score >= 40 && score < 55) {
        result = "/static/images/overlay/orange.png";
    } else  if (score >= 55){ */
    if (score >= 50 && score < 53.5) {
        result = "/static/images/overlay/orange.png";
    } else if (score >= 53.5){
        result = "/static/images/overlay/red.png";
    }
    return result;
}

function shouldDisplayOverlay(score) {
    return score >= 15;
}

function getTileSize(vr) {
    if (vr.tileSize != undefined) {
        return vr.tileSize;
    }
    else if (vr.tiles > 0 ) {
        var row = vr.tiles[0];
        if (row) {
            var cell = row[0];
            if (cell) {
                return cell.size.width;
            }
        }
    }
    return 300;
}

function toggleWatsonOverlays(event) {
    showWatsonData = $(this).is(":checked");
    for (var x=0; x<watsonOverlays.length; x++) { 
        watsonOverlays[x].setOpacity(showWatsonData ? 1 : 0);
    }     
    for (var x=0; x<watsonTextOverlays.length; x++) { 
        if (showWatsonData) {
            imageMapRenderer.addLayer(watsonTextOverlays[x]);
        } else {
            imageMapRenderer.removeLayer(watsonTextOverlays[x]);
        }
    }      
}

function calculateSummary() {
    var costPerSquare = parseFloat($("#costPerSquare").val())
    var costPerFlashing = parseFloat($("#costPerFlashing").val())
    var costPerGutter = parseFloat($("#costPerGutter").val())

    var area = 2000;
    var squares = area/100;
    var flashing = 75;
    var gutter = 250;

    var shingleCost = squares * costPerSquare;
    var flashingCost = flashing * costPerFlashing;
    var gutterCost = gutter * costPerGutter;

    $("#shingleCost").text("$" + shingleCost.toFixed(2))
    $("#flashingCost").text("$" + flashingCost.toFixed(2))
    $("#gutterCost").text("$" + gutterCost.toFixed(2))
    $("#totalCost").text("$" + (gutterCost+flashingCost+shingleCost).toFixed(2))
}