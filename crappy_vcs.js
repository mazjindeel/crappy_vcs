var diff_match_patch = require('./diff_match_patch.js');
var dmp = new diff_match_patch.diff_match_patch();
var fetch = require('node-fetch');
var uuid = require('uuid');

var EVENT_STORE_DOMAIN =  "http://127.0.0.1";
var EVENT_STORE_PORT = "2113";
var EVENT_STREAM_URL = EVENT_STORE_DOMAIN + ":" + EVENT_STORE_PORT + "/streams/";

var FILE_CREATE = "FILE_CREATE";
var FILE_UPDATE = "FILE_UPDATE";
var FILE_DELETE = "FILE_DELETE";

// Return response body
async function generateEvent (type, data) {
	try {
		const response = await fetch(EVENT_STREAM_URL + type, {
		// url example => http://127.0.0.1:2113/streams/eventType
		method: "POST",
		headers: {
			'ES-EventType': type,
			'ES-EventId': uuid.v1(),
			'content-type': 'application/json'
		},
		//json: true,   // adds "content-type:application/json"
		encoding: null,
		body: JSON.stringify(data)
	});
		const resp = await response.text();
		return resp;
	} catch (error) {
		console.log(error);
	}
}

// Read all events from a stream (inefficient, but meh) \o/
// Returns json with all the events in this stream. 
async function readStream (stream) {
	// First, we need the atom stream
	// curl -i -H "Accept:application/vnd.eventstore.atom+json" "http://127.0.0.1:2113/streams/newstream"
	try {
		const response = await fetch(EVENT_STREAM_URL + stream, {
			method: "GET",
			headers: {
				'Accept': 'application/vnd.eventstore.atom+json'
			}
		});
	    const body = await response.json();
		// TODO: do we have to deal with paging? do we care? For now, no. 

		// There are many "entries" in a body, we want to get them all! 
		// According to the docs, we want to follow the "alternate" links for each event. 
		var eventLinks = [];
		if (body) {
			eventLinks = body.entries.map((entry) => { 
				return entry.links.filter((link) => {
					return link.relation == "alternate";
				}).map((links) => {
					return links.uri;
				})
			}).map((arr) => {
				return arr[0];
			});
		}

		var events = await Promise.all(eventLinks.map(async (link) => {
			// curl -i http://127.0.0.1:2113/streams/newstream/0 -H "Accept: application/json"
			const response = await fetch(link, {
				method: "GET",
				headers: {
					'Accept': 'application/json',
				},
			});
			const event = await response.json();
			return event;
		}));
		// Results are coming in most-recent, we want oldest first
		return events.reverse();
	} catch (error) {
		//console.log(error);
	}
}

// Recreate a file using the event stream based off the "id". 
async function recreateFileFromStream(fileId) {
	// This is CQRS - our model in this "view" is different from original data model. 
	// Data model is b64 encoded, this won't be. 
	var file = {};

	// Recreate file from stream
	const createEvents = await readStream(FILE_CREATE);
	createEvents.forEach((event) => {
		if (event.id == fileId) {
			file.content = Buffer.from(event.b64_file, 'base64').toString();
			file.project =  event.project;
			file.id =  event.id;
			file.name = event.name;
			file.deleted =  false;
		}
	});

	// Apply all the updates from the stream
	const updateEvents = await readStream(FILE_UPDATE);
	if (updateEvents) {
		updateEvents.forEach((update) => {
			if (update.id == fileId) {
				var updated = dmp.patch_apply(update.diff, file.content)[0];
				file.content = updated;
			}
		});
	}

	// See if file was ever deleted
	const deleteEvents = await readStream(FILE_DELETE);
	if (deleteEvents) {
		deleteEvents.forEach((event) => {
			if (event.id == fileId) {
				file.deleted = true;
			}
		});
	}
	
	return file;
}

module.exports = {
	FILE_CREATE: FILE_CREATE,
	FILE_UPDATE: FILE_UPDATE,
	FILE_DELETE: FILE_DELETE,
	generateEvent: generateEvent,
	readStream: readStream,
	recreateFileFromStream: recreateFileFromStream
};

