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

1. Run the event source. You can simply enter the `eventsource` command to run a default configuration. Use `eventsource --mem-db` to use an in-memory database (this way you start fresh every time you restart it)
2. While the eventsource server is running, you can run `npm run test` to run the tests. 
3. You can visit [localhost:2113](localhost:2113) and log in with credentials `admin`/`changeit` to view the server's GUI (more details on eventsource's site linked above).

## About

It is capable of creating, tracking modifications to, and deletions of files. 

There are three types of events - FILE\_CREATE, FILE\_UPDATE, and FILE\_DELETE. 

Any number of updates is supported, as is any number of deletions. Deletions cannot be reversed, thought that would be easy to add. 

## Limitations

Obviously, you shouldn't use this in production. 

It might choke if the `eventstore` ever starts paging results.
