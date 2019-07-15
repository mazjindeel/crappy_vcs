# Crappy VCS

At a high level, the goal of this project is to track the changes made to a
file in an effort to learn about event sourcing for applications.

This will be a program using [eventsource](www.eventsource.org) to manage events.

It is pretty simple and uses Google's
[diff-match-patch](https://github.com/google/diff-match-patch) library under
the hood to manage the differences between files

## Installation

1. Install [eventsource](www.eventsource.org). On a mac, you can run `brew cask install eventstore`
2. Install [Node.js](https://nodejs.org/en/).
3. Run `npm install` in the project's root directory. 

## Running

1. Run the event source. You can simply enter the `eventsource` command to run a default configuration. 
2. While the eventsource server is running, you can run `node index.js` to run the app. 
	* Right now the app simply creates a bunch of FILE\_CREATE events and reads all the previous FILE\_CREATE events.
3. You can visit [localhost:2113](localhost:2113) and log in with credentials `admin`/`changeit` to view the server's GUI (more details on eventsource's site linked above).
