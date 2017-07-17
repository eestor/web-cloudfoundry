/*eslint-env node*/

//------------------------------------------------------------------------------
// node.js starter application for Bluemix
//------------------------------------------------------------------------------

// This application uses express as its web server
// for more info, see: http://expressjs.com
var express = require('express');
var jade = require('jade');
var fs = require('fs');
var bodyParser = require('body-parser');
var jsonfile = require('jsonfile');
var Cloudant = require('cloudant');
var fileUpload = require('express-fileupload');
var uuid = require('node-uuid');
var s3 = require('s3');
var cookieParser = require('cookie-parser');
var methodOverride = require('method-override');

var Enums = require('./app/enums.js');
var realtime = require('./app/realtime.js');
var authCookie = "authorization";
var authPass = "blacklamp" //yes, this is very insecure, but its good enough for now, since its not real data, and not live

// cfenv provides access to your Cloud Foundry environment
// for more info, see: https://www.npmjs.com/package/cfenv
var cfenv = require('cfenv');

// create a new express server
var app = express();
app.set('view engine', 'jade');
app.use(cookieParser())
var http = realtime.init(app);


// serve the files out of ./public as our main files
app.use('/static', express.static(__dirname + '/static'));
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(fileUpload());

app.use(methodOverride());
// Enable CORS
app.use(function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
       
    // intercept OPTIONS method
    if ('OPTIONS' == req.method) {
      res.send(200);
    }
    else {
      next();
    }
});


//file upload configuration
var rootDir = './uploads';
var s3Client = s3.createClient({
    s3Options: {
        accessKeyId: "y2x87rRAM5nipBcrZM10",
        secretAccessKey: "yEmoe7LVGkfVJyRDEfTFdkCzSBzzDpKI4QhUE8Ek",
        endpoint: 's3-api.us-geo.objectstorage.softlayer.net',
        sslEnabled: false
    },
});
//TODO: externalize S3 credentials

// get the app environment from Cloud Foundry
var appEnv = cfenv.getAppEnv();

if (appEnv.isLocal) {
    appEnv.services = jsonfile.readFileSync('./config/services.json');
}

// Initialize Cloudant DB
var cloudantConfig = appEnv.services.cloudantNoSQLDB[0];
var cloudant = Cloudant(cloudantConfig.credentials.url);
var db
var dbName = "jupiter"


cloudant.db.create(dbName, function(err, result) {

    if (err) {
        console.log('[db.create] ' + err.message.toString());
    }

    // Specify the database we are going to use...
    db = cloudant.db.use(dbName)
});

/*
app.get('/services', function (req, res) {
    res.send(JSON.stringify(appEnv))
});
*/

app.all('*', function(req, res, next) {
    if (!(req.url.startsWith("/static") || (req.url.startsWith("/authorize") && req.method == "POST"))) {
        if (req.cookies[authCookie] == undefined) {
            console.log("no cookie")
            res.redirect('/static/html/authorization.html');
            return;
        }
    }
    next();
});

app.post('/authorize', function(req, res) {

    var data = req.body;
    console.log(data)
        //hard code for now... just limiting access to beta/PoC
    if (data.password.toLowerCase() == authPass) {
        //cookie expires in 1 year
        var expiration = 1000 * 60 * 60 * 24 * 365;
        res.cookie(authCookie, uuid.v4(), { httpOnly: true, maxAge: expiration });
    }
    res.redirect('/');

});


app.get('/', function(req, res) {
    res.render("index", { pageTitle: "" });
});


app.get('/property_analysis', function(req, res) {
    res.render("property_analysis", { pageTitle: "Create A New Property Analysis", backLink: "/" });
});


app.post('/property_analysis', function(req, res) {

    var property = req.body;

    if (property.captureDate == undefined || property.captureDate.length <= 0 ||
        property.street == undefined || property.street.length <= 0 ||
        property.city == undefined || property.city.length <= 0 ||
        property.state == undefined || property.state.length <= 0 ||
        property.zip == undefined || property.zip.length <= 0
    ) {
        res.status(500).send("Missing required parameters.");
    } else {
        var now = new Date()
        property.created = now.getTime()
        property.status = Enums.PropertyState.READY_FOR_UPLOAD;
        property.type = Enums.DataType.PROPERTY;

        db.insert(property, function(err, body, header) {
            if (err) {
                res.status(500).send('[db.insert.property] ' + err.message.toString());
            } else {
                res.redirect('/property/' + body.id.toString());
            }
        });
    }
});


app.get('/property/:id?', function(req, res) {
    var id = req.params.id;
    db.get(id, function(err, body) {
        if (err) {
            res.status(404).send(err.toString());
            return;
        }

        db.find({ selector: { property: id } }, function(er, result) {
            if (er) {
                res.status(500).send(er.toString());
                throw er;
            }
            result.docs = result.docs.sort(sortImages)
            res.render("property", { body: body, images: result.docs, enums: Enums, pageTitle: body.street, backLink: "/browse_properties" });
        });

    })
});


app.post('/property/:id?/beginAnalysis', function(req, res) {
    console.log("beginAnalysis")
    var id = req.params.id;
    var formId = req.body.propertyId;
    if (id == formId) {

        db.get(id, function(err, body) {
            if (err) {
                res.status(404).send(err.toString());
                return;
            }

            var now = new Date()
            body.status = Enums.PropertyState.READY_FOR_PROCESSING
            body.statusUpdated = now.getTime()

            db.insert(body, function(err, body) {
                if (err) {
                    res.status(500).send(err.toString());
                    throw er;
                }
                realtime.emit(id, "Status updated: " + Enums.PropertyState.READY_FOR_PROCESSING)
                res.redirect('/property/' + body.id.toString());
            });

        })


    } else {
        res.status(500).send("Invalid request to begin analysis.")
    }


});


app.post('/property/:id?/upload', function(req, res) {
    if (!req.files) {
        res.status(500).send('No files were uploaded.');
        return;
    }

    var id = req.params.id;
    var fileId = uuid.v4();
    var uploadDir = rootDir + "/" + id;

    //make sure we actually have a document before we write to disk
    db.get(id, function(err, body) {
        if (err) {
            res.status(500).send(err.toString());
            return;
        }

        if (!fs.existsSync(rootDir)) {
            fs.mkdirSync(rootDir);
        }

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }

        var file = req.files.file;
        var imagePath = uploadDir + "/" + file.name;
        var s3Path = id + "/original/" + file.name;

        realtime.emit(id, "File Received: " + file.name + ". Transferring to Object Storage...");

        file.mv(imagePath, function(err) {
            if (err) {
                res.status(500).send(err);
            } else {
                res.status(200).send("OK");

                //now move it over to S3
                var params = {
                    localFile: imagePath,
                    s3Params: {
                        Bucket: "yuma310",
                        Key: s3Path,
                        ACL: 'public-read'
                    },
                };
                var uploader = s3Client.uploadFile(params);
                uploader.on('error', function(err) {
                    console.error("unable to upload:", err.stack);
                });
                uploader.on('progress', function() {
                    console.log("progress", uploader.progressMd5Amount, uploader.progressAmount, uploader.progressTotal);
                });
                uploader.on('end', function() {
                    console.log("done uploading to s3");
                    realtime.emit(id, "File Saved in Object Storage: " + file.name);

                    var now = new Date()
                    var image = {
                        created: now.getTime(),
                        property: id,
                        path: s3Path,
                        type: Enums.DataType.IMAGE,
                        omit: false
                    }

                    db.insert(image, function(err, body, header) {
                        if (err) {
                            console.log('[db.insert.image] ' + err.message.toString());
                        }
                        realtime.emit(id, "Image record created in database: " + file.name);
                    });

                    //delete file that was just uploaded
                    fs.unlinkSync(imagePath);

                    //delete the project directory if its empty
                    if (fs.existsSync(uploadDir)) {
                        var arr = fs.readdirSync(uploadDir)
                        if (arr.length <= 0) {
                            fs.rmdirSync(uploadDir);
                        }
                    }

                });
            }
        })
    });
});


app.get('/property/:id/:folder/:file', function (req, res) {

    var id = req.params.id;
    var folder = req.params.folder;
    var file = req.params.file;


    var params = {
        Bucket: "yuma310",
        Key: id + "/" + folder + "/" + file
      
    };
    var stream = s3Client.downloadStream(params);

    stream.pipe(res);
});


app.get('/browse_properties', function(req, res) {
    //res.render("browse_properties", {});
    db.view('jupiter', 'properties', { "descending": true }, function(err, body) {
        if (err) {
            res.status(404).send(err.toString());
            return;
        }
        //this should really be sorted on the database 
        //body.rows = body.rows.sort(sortList)
        res.render("browse_properties", { body: body, pageTitle: "Browse Properties", backLink: "/" });
    })
});

// DataWing Integration API

// Step 2 and 3
app.get('/claims/images/:id/:folder/:file', function (req, res) {

    var id = req.params.id;
    var folder = req.params.folder;
    var file = req.params.file;


    var params = {
        Bucket: "yuma310",
        Key: id + "/" + folder + "/" + file
      
    };
    var stream = s3Client.downloadStream(params);

    stream.pipe(res);
});

// Step 4
app.post('/claims/analysis/:id', function(req, res) {

    var id = req.params.id;
    db.get(id, function(err, body) {
        if (err) {
            res.status(404).send(err.toString());
            return;
        }

        var now = new Date()
        body.status = Enums.PropertyState.COMPLETE
        body.statusUpdated = now.getTime()

        db.insert(body, function(err, body) {
            if (err) {
                res.status(500).send(err.toString());
                throw er;
            }
            realtime.emit(id, "Status updated: " + Enums.PropertyState.COMPLETE)
            res.status(200).send("Status Updated!..");
        });

    });  

});

// app.get('/posttodatawing/:id', function(req, res) {
//     var id = req.params.id;
//     var raw_images = [];
//     var watsonized_images = [];
//     var count = 0;
//     var images = {}

//     db.view('jupiter', 'datawing-view', { key: id }, function(err, prop) {
//         if (err) {
//             res.status(404).send(err.toString());
//             return;
//         }

//         db.find({ selector: { property: id } }, function(er, body) {
//             if (er) {
//                 res.status(500).send(er.toString());
//                 throw er;
//             }

//             body.docs.forEach(function(elem) {
//                 raw_images.push(elem.path);
//                 wi = elem.path.replace("original", "data-overlay");
//                 watsonized_images.push(wi);
//                 count++;
//             });

//             if(count == body.docs.length) {
//                 prop.rows[0].value.images = {raw_images: raw_images, watsonized_images: watsonized_images };
//                 res.json(prop.rows[0].value);
//             }
//         });
//     });
// });

function sortImages(a, b) {
    if (a.path < b.path) {
        return -1;
    }
    if (a.path > b.path) {
        return 1;
    }
    // a must be equal to b
    return 0;
}



// start server on the specified port and binding host
http.listen(appEnv.port, '0.0.0.0', function() {
    // print a message when the server starts listening
    console.log("server starting on " + appEnv.url);
});