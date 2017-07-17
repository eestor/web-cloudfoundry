


// Get the template HTML and remove it from the doumenthe template HTML and remove it from the doument
var previewNode = document.querySelector("#template");
previewNode.id = "";
$(previewNode).removeClass("hidden")
var previewTemplate = previewNode.parentNode.innerHTML;
previewNode.parentNode.removeChild(previewNode);
var uploadsComplete = 0;

var myDropzone = new Dropzone(document.body, { // Make the whole body a dropzone
  url: window.location.href + "/upload", // Set the url
  thumbnailWidth: 80,
  thumbnailHeight: 80,
  parallelUploads: 8,
  previewTemplate: previewTemplate,
  autoQueue: false, // Make sure the files aren't queued until manually added
  previewsContainer: "#previews", // Define the container to display the previews
  clickable: ".fileinput-button", // Define the element that should be used as click trigger to select files.
  acceptedFiles: "image/jpeg,image/jpg",
  createImageThumbnails: false
});

myDropzone.on("addedfile", function(file) {
  // Hookup the start button
  file.previewElement.querySelector(".start").onclick = function() { myDropzone.enqueueFile(file); };
});

// Update the total progress bar
myDropzone.on("complete", function(progress) {
  uploadsComplete++;
  if (progress.status == "success") {
    $(progress.previewElement).remove();

    var baseImages = parseInt($("#imagesUploaded").val());
    $("#uploadTotal").text((baseImages + uploadsComplete) + " images uploaded");
    $(".startProcessing").removeClass("disabled").prop("disabled", false);
  }
});

// Update the total progress bar
myDropzone.on("reset", function(progress) {
  uploadsComplete = 0;
});

// Update the total progress bar
/*myDropzone.on("totaluploadprogress", function(progress) {
  var precentComplete = uploadsComplete % myDropzone.files.length;
  document.querySelector("#total-progress .progress-bar").style.width = precentComplete + "%";
});
*/
myDropzone.on("sending", function(file) {
  // And disable the start button
  file.previewElement.querySelector(".start").setAttribute("disabled", "disabled");
});

// Hide the total progress bar when nothing's uploading anymore
myDropzone.on("queuecomplete", function(progress) {
  $("#button .startProcessing").removeClass("disabled")
});

// Setup the buttons for all transfers
// The "add files" button doesn't need to be setup because the config
// `clickable` has already been specified.
document.querySelector("#actions .start").onclick = function() {
  myDropzone.enqueueFiles(myDropzone.getFilesWithStatus(Dropzone.ADDED));
};
document.querySelector("#actions .cancel").onclick = function() {
  myDropzone.removeAllFiles(true);
};