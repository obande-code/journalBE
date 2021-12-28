'use strict';

const Hapi = require('@hapi/hapi');
const fs = require('fs')
const speech = require('@google-cloud/speech');
const ffmpeg = require('fluent-ffmpeg');  
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);
const client = new speech.SpeechClient();

let users = [];
let credential = null;
const init = async () => {

    const server = Hapi.server({
        port: 3005,
        host: 'localhost'
    });

    server.route({
        method: 'POST',
        path: '/speech',
        config: {
            handler: async (request, h) => {
                const data = request.payload;
                if (data.file) {
                    const name = data.file.hapi.filename;
                    console.log(name, 'name');
                    const path = __dirname + "/uploads/" + name;
                    const encodedPath = __dirname + "/uploads/encoded_" + name;
                    const file = fs.createWriteStream(path);
    
                    file.on('error', (err) => console.error(err));
    
                    data.file.pipe(file);
    
                    return new Promise(resolve => {
                        data.file.on('end', async (err) => { 
                            const ret = {
                                filename: data.name,
                                headers: data.file.hapi.headers
                            }

                            ffmpeg()
                                // .input(path)
                                .input(__dirname + "/uploads/3-audioMessage.m4a")
                                .outputOptions([
                                    '-f s16le',
                                    '-acodec pcm_s16le',
                                    '-vn',
                                    '-ac 1',
                                    '-ar 41k',
                                    '-map_metadata -1'
                                ])
                                .save(encodedPath)
                                .on('end', async () => {
                                    const savedFile = fs.readFileSync(encodedPath)
                                    console.log(savedFile);
                                    const audioBytes = savedFile.toString('base64');
                                    const audio = {
                                        content: audioBytes,
                                    }
                                    const sttConfig = {
                                        enableAutomaticPunctuation: false,
                                        encoding: "LINEAR16",
                                        sampleRateHertz: 41000,
                                        languageCode: "en-US",
                                        model: "default"
                                    }
            
                                    const request = {
                                        audio: audio,
                                        config: sttConfig,
                                    }
                                    const [response] = await client.recognize(request);
                                    const transcription = response.results
                                        .map(result => result.alternatives[0].transcript)
                                        .join('\n');

                                    // fs.unlinkSync(path)
                                    // fs.unlinkSync(encodedPath)
                                    console.log(transcription, 'transcription')
                                    resolve(JSON.stringify({...ret, transcript: transcription}))

                                })
                        })
                    })
                }
            },
            payload: {
                output: 'stream',
                parse: true,
            }
        }
    })
    server.route({
        method: 'POST',
        path: '/signUp',
        config: {
            handler: async (request, h) => {
                console.log(request.payload);
                users.push(request.payload);
                return 'GET';
            }
        }
    })
    server.route({
        method: 'POST',
        path: '/login',
        config: {
            handler: async (request, h) => {
                console.log(request.payload);
                let body = request.payload;
                users.forEach(element => {
                    if (element.name === body.name && element.password === body.password) {
                        console.log('success')
                        credential = body;
                    }
                });
                if (credential === null) {
                    return 'FAIL';
                }
                else {
                    return 'SUCCESS';
                }
            }
        }
    })
    await server.start();
    console.log('Server running on %s', server.info.uri);
};

process.on('unhandledRejection', (err) => {
    console.log(err);
});

init();