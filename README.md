# CryptoFire-Chat

A simple chat application [demo](https://chat-a9892.firebaseapp.com/) demonstrating end-to-end encryption where the content of messages is completely hidden from the sever.

## General

This is a weekend project that is meant to test the WebCryptoAPI and Firebase. Messages are end-to-end encrypted between the users. Furthermore, messages are destroyed on the server as soon as they reach their destination. 
The app is based on the Firebase Friendly Chat starter project.

Conversations are organized into chat rooms. Each room is identified by a unique name in the URL that can be shared with another person to start a conversation. 
Each room supports (for now) 2 users:

* Host: Creates the room, with a unique id.
* Guest: Joins a room after receiving a room id (or stumbling onto one).

## Firebase

I have picked Firebase as a backend for this app because it offered a simple integration for user profiles and a real-time database to exchange messages. 
I used to be a Parse fanboy for a long time, and Firebase seemed lacking before, but I'm starting to see its appeal. 
However, the plan is to move away from centralized solutions to a p22p one (WebRTC maybe, if I ever manage to get it to work).

### Why login with Google?

I needed a way to uniquely identify users, Google is the default integration with Firebase but I will add other providers like Github, Twitter and Facebook. 
The chat can function purely on usernames but that would be done later.

## Can I use this?

Use it for fun, experiments and break it! 
This is **NOT** meant for any serious use! This is just an experiment.

If you find a bug, open an issue or send an email : [raed.chammam@gmail.com](mailto:raed.chammam@gmail.com).
