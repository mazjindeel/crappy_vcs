var diff_match_patch = require('./diff_match_patch.js');
var dmp = new diff_match_patch.diff_match_patch();
var request = require('request');
var uuid = require('uuid');

var EVENT_STORE_DOMAIN =  "http://127.0.0.1";
var EVENT_STORE_PORT = "2113";
var EVENT_STREAM_URL = EVENT_STORE_DOMAIN + ":" + EVENT_STORE_PORT + "/streams/";

var FILE_CREATE = "FILE_CREATE";
var FILE_UPDATE = "FILE_UPDATE";
var FILE_DELETE = "FILE_DELETE";

// Generate a "CREATE_FILE" event
// Generate an "event"
generateEvent = function(type, data, callback=undefined) {
	request({
		// url example => http://127.0.0.1:2113/streams/eventType
		url: EVENT_STREAM_URL + type,
		method: "POST",
		headers: {
			'ES-EventType': type,
			'ES-EventId': uuid.v1()
		},
		json: true,   // adds "content-type:application/json"
		body: data
	}, (error, response, body) => {
		if (error) console.log(error);
		typeof callback === 'function' && callback(body);
	});
}

// Read all events from a stream (inefficient, but meh) \o/
// Calls the callback for every event in that stream. 
// So, stream will be a project name
readStream = function(stream, callback) {

	// First, we need the atom stream
	// curl -i -H "Accept:application/vnd.eventstore.atom+json" "http://127.0.0.1:2113/streams/newstream"
	request({
		url: EVENT_STREAM_URL + stream,
		method: "GET",
		headers: {
			'Accept': 'application/vnd.eventstore.atom+json'
		}
	}, (error, response, body) => {
		if (error) { console.log(error); return; }

		// TODO: do we have to deal with paging? do we care? 
		// There are many "entries" in a body, we want to get them all! 
		// According to the docs, we want to follow the "alternate" links for each event. 
		var eventLinks = [];
		if (body) {
			eventLinks = JSON.parse(body).entries.map((entry) => { 
				return entry.links.filter((link) => {
					return link.relation == "alternate";
				}).map((links) => {
					return links.uri;
				})
			}).map((arr) => {
				return arr[0];
			});
		}

		eventLinks.forEach((link) => {
			// curl -i http://127.0.0.1:2113/streams/newstream/0 -H "Accept: application/json"
			request({
				url: link,
				method: "GET",
				headers: {
					'Accept': 'application/json',
				},
			}, (error, response, body) => {
				if (error) { console.log(error); return; }
				let event = JSON.parse(body);
				typeof callback === 'function' && callback(event);
			});
		});
	});
}

// Recreate a file using the event stream based off the "id". 
recreateFileFromStream = function(fileId, callback) {
	return readStream(FILE_CREATE, (file) => {
		if (file.id == fileId) {
			// This is CQRS - our model in this "view" is different from original data model. 
			// Data model is b64 encoded, we are not. 
			var fileView = {
				content: Buffer.from(file.b64_file, 'base64').toString(),
				project: file.project,
				id: file.id,
				name: file.name,
				deleted: false
			};

			readStream(FILE_UPDATE, (update) => {
				if (update.id == fileId) {
					dmp.patch_apply(update.diff, fileView.content);
				}
			});

			readStream(FILE_DELETE, (deleteEvent) => { // delete == reserved keyword
				console.log("Found delete event", deleteEvent);
				console.log("fileID: ", fileId);
				if (deleteEvent.id == fileId) {
					// Currently, there's no way to get "un-deleted". That would be cool to add. 
					fileView.deleted = true;
					console.log("Found dleted file with id", deleteEvent.id);
				}
			});
			typeof callback === 'function' && callback(fileView);
		}
	});
}

/* ******************************** TESTS *********************************** */

// we shouldn't allow duplicate names, it makes things a big pain for now we add a unique timestamp to each name
const project = "testing";
const fileName = "test.txt" + uuid.v1();
const contents = "foobarco is the best company";
const new_content = "Code42 is the best company";
const fileId = uuid.v1();

const originalFile = {
	project: project,
	name: fileName,
	b64_file: Buffer.from(contents).toString('base64'),
	id: fileId
};

const newFile = {
	project: project,
	name: fileName,
	b64_file: Buffer.from(new_content).toString('base64'),
	id: fileId
};

// Create file and find that event in the stream.
testCreateFile = function() {
	console.log("in tcf");
	generateEvent(FILE_CREATE, originalFile, () => {
		console.log("generated event");
		readStream(FILE_CREATE, (file) => {
			if (file.name == fileName) {
				console.log(file);
				testVerifyFileCreation();
			}
		})
	});
}

// Verify that the file was created, show its view
testVerifyFileCreation = function() {
	recreateFileFromStream(fileId, (file) => {
		console.log("Found  after creation file, recreated from stream");
		console.log(file);
		testUpdateFile();
	});
}

// update the file to new_content
testUpdateFile = function() {
	console.log("In testupdatefile");
	recreateFileFromStream(fileId, (file) => {
		// File is our "fileView". I.E. it is not base-64 encoded
		let patch = dmp.patch_make(dmp.diff_main(file.content, new_content));
		generateEvent(FILE_UPDATE, patch);
		testVerifyFileModification();
	});
}

// Verify that the file was modified
testVerifyFileModification = function() {
	recreateFileFromStream(fileId, (file) => {
		console.log("Found file after update, recreated from stream");
		console.log(file);
		testDeleteFile();
	});
}

// Delete the file
testDeleteFile = function() {
	console.log("Deleting file");
	generateEvent(FILE_DELETE, {id: fileId});
	testVerifyFileDelete();
}

// Verify file's deletion
testVerifyFileDelete = function() {
	recreateFileFromStream(fileId, (file) => {
		console.log("Found file after delete, recreated from stream");
		console.log(file);
		console.log("DONE with tests");
	});
}

testCreateFile();
//TODO: actually implement the VCS part of this concoction
//let s1 = "Hello", s2 = "H3ll0";
//let result = dmp.diff_main(s1, s2);
//console.log(result);
