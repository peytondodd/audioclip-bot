const pcmUtil = require('pcm-util');
const AudioBuffer = require('audio-buffer');
const abUtil = require('audio-buffer-utils');
const Readable = require('stream').Readable
const aws = require('./aws.js');
const ffmpeg = require('fluent-ffmpeg');

/**
 * Pre-defined functions for handling the voice that is output after
 * processing and editing. Define your own or use one of these when
 * calling doClip.
 */
var clipHandlers = {
	PLAY_VOICE: playVoice,
	UPLOAD_VOICE: uploadVoice
}

/**
 * Play `seconds` of the currently collected streams to the current voice
 * connection in the specified guild.
 * @param  {int} seconds The amount of seconds to play
 * @param  {[type]} sourceTextChannel The text channel from which the command
 * originated
 * @param  {function} clipHandler function that does something with 
 * clipped audio, for example play it back to Discord. Define your own or
 * use from clipHandlers.
 */
function doClip(voiceConnection, seconds, sourceTextChannel, clipHandler) {
	var streams = voiceConnection.streams;
	//console.log(streams, streams.length);
	// Need to wait for reading from stream to fully finish before
	// attempting to edit it
	processStream(streams).then((processedStreams) => {
		console.log(processedStreams)
		// Need to concatenate the buffers to make pcm-util and audio-buffers
		// read them correctly
		const clippedStream = editBuffer(processedStreams, seconds);
		
		// Pushing an extra null here is necessary in order to make the stream pipeable
		clippedStream.push(null);

		// Do something with the clipped audio
		clipHandler(clippedStream, sourceTextChannel, voiceConnection);
	}).catch((error) => console.log(error));
}

function uploadVoice(stream, textChannel) {
	const outputFile = 'libfile.mp3';

	saveStream(stream, outputFile)/*.then(() => {
		aws.upload(outputFile).then((fileUrl) => {
			textChannel.sendMessage('Clip uploaded! URL: ' + fileUrl);
		})
		.catch((error) => console.log(error));
	}).catch((error) => console.log(error));*/
}

function playVoice(stream, textChannel, voiceConnection) {
	voiceConnection.connection.playConvertedStream(stream);
}

function processStream(streams) {
	//var bufs = [];
	var finished = 0;
	const initialStreamsLength = streams.length;

	return new Promise((resolve, reject) => {
		for(var i = 0; i < initialStreamsLength; i++) {
			let streamPart = streams[i];
			streamPart.stream.on('data', function(d) { 
				streamPart.buffer.push(d); 
			});
			streamPart.stream.on('end', function() {
				if(++finished === initialStreamsLength) {
					resolve(streams);
				}
			});
			streamPart.stream.on('error', (error) => {
				reject(error);
			})
		}		
	});
}

function saveStream(stream, fileName) {
	// Need to specify how the input stream is built. In this example we use
	// signed 16-bit little endian PCM audio at 48kHz and two channels
	// Note: Input audio stream is actually 44.1kHz, but we need to tell it to use
	// 48kHz to make it sound 'normal' (else frequency is too low and it sounds
	// a lot lower pitch than the person's normal speaking voice) 
	const fs = require('fs');
	var s1 = fs.createWriteStream("stream2");
	stream.pipe(s1);
	/*
	return new Promise((resolve, reject) => {
		var command = ffmpeg()
			.input(stream)
			.inputOptions([
				'-f s16le',
				'-ar 48k',
				'-ac 2'])
			.audioCodec('libmp3lame')
			.on('error', (err) => {
				reject(err);
			})
			.on('end', () => {
				console.log("Finished saving file.");
				resolve();
			})
			.save(fileName)
	});
	*/
}

function editBuffer(streams, seconds) {
	// Using any other sample rate will cause delays when mixing streams. Not sure why atm
	const sampleRate = 48000;
	
	// Use first buffer as base
	var mainBuffer = abUtil.clone(pcmUtil.toAudioBuffer(Buffer.concat(streams[0].buffer)));

	for(var i = 1; i < streams.length; ++i) {
		//var aBuf = abUtil.trimRight(pcmUtil.toAudioBuffer(Buffer.concat(streams[i].buffer)), 0.02);
		var aBuf = pcmUtil.toAudioBuffer(Buffer.concat(streams[i].buffer));

		// Need to round in order for mix function to accept offset
		const offset = Math.round((streams[i].startTime - streams[0].startTime) * sampleRate);
		mainBuffer = abUtil.pad(mainBuffer, Math.max(mainBuffer.length, aBuf.length + offset));
		mainBuffer = abUtil.mix(mainBuffer, aBuf, .5, offset);
	}

	// Plays seconds time starting from the end
	//var modifiedBuffer = abUtil.slice(audioBuf, seconds*sampleRate, audioBuf.length);
	var modifiedBuffer = abUtil.slice(mainBuffer, 0,seconds*sampleRate); // mainBuffer bara?
	var shorterBuffer = pcmUtil.toBuffer(modifiedBuffer);
	var shorterStream = new Readable();
	shorterStream.push(shorterBuffer);

	return shorterStream;
}

function playYoutube(voiceConnection, url) {
	const ytdl = require('ytdl-core');
	const streamOptions = { seek: 0, volume: 0.3 };
    const stream = ytdl(url, {filter : 'audioonly'});
  	console.log(stream);
    return voiceConnection.connection.playStream(stream, streamOptions);
}


exports.doClip = doClip;
exports.clipHandlers = clipHandlers;
exports.playYoutube = playYoutube;