var diff_match_patch = require('./diff_match_patch.js');
var request = require('request');
var uuid = require('uuid');

var EVENT_STORE_DOMAIN =  "http://127.0.0.1";
var EVENT_STORE_PORT = "2113";
var EVENT_STREAM_URL = EVENT_STORE_DOMAIN + ":" + EVENT_STORE_PORT + "/streams/";

var FILE_CREATE = "FILE_CREATE";
var FILE_UPDATE = "FILE_UPDATE";
var FILE_DELETE = "FILE_DELETE";

// Generate a "CREATE_FILE" event
// Project name is like a "repository". 
createFile = function(fileName, fileContents, project="testing", fileId=uuid.v1()) {
	var data  = { 
		// Obviously is a naive file representation \o/
		name: fileName,
		project: project,
		b64_file: Buffer.from(fileContents).toString('base64'),
		id: fileId
	};
	
	request({
		// url example => http://127.0.0.1:2113/streams/eventType
		url: EVENT_STREAM_URL + FILE_CREATE,
		method: "POST",
		headers: {
			'ES-EventType': FILE_CREATE,
			'ES-EventId': uuid.v1()
		},
		json: true,   // adds "content-type:application/json"
		body: data
	}, function(error, response, body) {
		if (error) console.log(error);
	});
}

// Generate a "FILE_UPDATE" event
updateFile = function(fileId, diff) {

	var data = {
		id: fileId,
		diff: Buffer.from(diff).toString('base64')
	}

	request({
		url: EVENT_STREAM_URL + FILE_UPDATE,
		method: "POST",
		headers: {
			'ES-EventType': eventType,
			'ES-EventId': uuid.v1()
		},
		json: true,
		body: data
	}, (error, response, body) => {
		if (error) console.log(error);
	});
}

// Generate a "FILE_DELETE" event.
deleteFile = function(fileId) {
	var data = {
		id: fileId
	}
	request({
		url: EVENT_STREAM_URL + FILE_DELETE,
		method: "POST",
		headers: {
			'ES-EventType': FILE_DELETE,
			'ES-EventId': uuid.v1()
		},
		json: true,
		body: data
	}, (error, response, body) => {
		if (error) console.log(error);
	});
}

// Read all events from a stream (inefficient, but meh) \o/
// Calls the callback for every event in that stream. 
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
		var eventLinks = JSON.parse(body).entries.map((entry) => { 
			return entry.links.filter((link) => {
				return link.relation == "alternate";
			}).map((links) => {
				return links.uri;
			})
		}).map((arr) => {
			return arr[0];
		});

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
				callback(event);
			});
		});
	});
}

// we shouldn't allow duplicate names, it makes things a big pain for now we add a unique timestamp to each name
var fileName = "test.txt" + uuid.v1();
var contents = "foobarco is the best company";

createFile(fileName, contents);

// TODO: we need to have some delay between these two calls! Right now, we don't get the newly-created file as a response. The right way to deal with this? Callbacks! Bah!
readStream(FILE_CREATE, function(event) {
	console.log("fileName is: ", fileName);
	console.log("event na is: ", event.name);
	if (event.name == fileName) {
		console.log("Found the right event!");
		console.log(event);
	}
	return;
});

//TODO: actually implement the VCS part of this concoction
//var dmp = new diff_match_patch.diff_match_patch();
//let s1 = "Hello", s2 = "H3ll0";
//let result = dmp.diff_main(s1, s2);
//console.log(result);
