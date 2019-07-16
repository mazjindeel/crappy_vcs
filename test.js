var diff_match_patch = require('./diff_match_patch.js');
var dmp = new diff_match_patch.diff_match_patch();
var uuid = require('uuid');

var vcs = require('./crappy_vcs.js');

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
	await vcs.generateEvent(vcs.FILE_CREATE, originalFile);
	var createEvents = await vcs.readStream(vcs.FILE_CREATE);
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
	var file = await vcs.recreateFileFromStream(fileId);
	if (file) {
		console.log("Found file after creation, recreated from stream decoded (cqrs)");
		console.log(file);
	} else {
		console.log("Could not find file we just created :(");
	}
}

async function testUpdateFile (content) {
	var file = await vcs.recreateFileFromStream(fileId);
	console.log("Updating file...");
	console.log("From: ", file.content);
	console.log("To: ", content);
	// File is our "fileView". I.E. it is not base-64 encoded (CQRS)
	let patch = dmp.patch_make(dmp.diff_main(file.content, content));
	await vcs.generateEvent(vcs.FILE_UPDATE, {id: fileId, diff: patch});
}

// Verify that the file was modified
async function testVerifyFileModification () {
	var file = await vcs.recreateFileFromStream(fileId);
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
	await vcs.generateEvent(vcs.FILE_DELETE, {id: fileId});
}

// Verify file's deletion
async function testVerifyFileDelete () {
	var file = await vcs.recreateFileFromStream(fileId);
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
