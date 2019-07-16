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

/* ******************************** TESTS *********************************** */

// we shouldn't allow duplicate names, it makes things a big pain for now we add a unique timestamp to each name
const project = "testing";
const fileName = "test.txt" + uuid.v1();
const contents = "foobarco is the best company";
const new_content = "Code42 is the best company";
const final_content = "FooBarCo is a company";

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
async function testCreateFile() {
	console.log("Creating a file");
	await generateEvent(FILE_CREATE, originalFile);
	var createEvents = await readStream(FILE_CREATE);
	createEvents.forEach((file) => {
		if (file.name == fileName) {
			console.log("Found create event for file we created");
			console.log(file);
		}
	});
}

// Verify that the file was created, show its view
async function testVerifyFileCreation () {
	console.log("Trying to find file we created");
	var file = await recreateFileFromStream(fileId);
	if (file) {
		console.log("Found file after creation, recreated from stream decoded (cqrs)");
		console.log(file);
	} else {
		console.log("Could not find file we just created :(");
	}
}

async function testUpdateFile (content) {
	var file = await recreateFileFromStream(fileId);
	console.log("Updating file...");
	console.log("From: ", file.content);
	console.log("To: ", content);
	// File is our "fileView". I.E. it is not base-64 encoded (CQRS)
	let patch = dmp.patch_make(dmp.diff_main(file.content, content));
	await generateEvent(FILE_UPDATE, {id: fileId, diff: patch});
}

// Verify that the file was modified
async function testVerifyFileModification () {
	var file = await recreateFileFromStream(fileId);
	if (file) {
		console.log("Updated file: ");
		console.log(file);
	} else {
		console.log("Could not find file we updated");
	}
}

// Delete the file
async function testDeleteFile () {
	console.log("Deleting file");
	await generateEvent(FILE_DELETE, {id: fileId});
}

// Verify file's deletion
async function testVerifyFileDelete () {
	var file = await recreateFileFromStream(fileId);
	if (file) {
		console.log("Found file after delete, recreated from stream");
		console.log(file);
	} else {
		console.log("Could not find file we deleted");
	}
}

async function test() {
	// Create file
	await testCreateFile();
	await testVerifyFileCreation();

	// Update it once
	await testUpdateFile(new_content);
	await testVerifyFileModification();
	
	// Update it again
	await testUpdateFile(final_content);
	await testVerifyFileModification();

	// Delete it 
	await testDeleteFile();
	await testVerifyFileDelete();
	console.log("Done with tests");
}

test();
