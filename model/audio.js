"use strict";
var console = require('../stdio.js').Get('modules/audio', { minLevel: 'verbose' });	// debug verbose
const inspect =	require('../utility.js').makeInspect({ depth: 5, compact: true });
const inspectPretty = require('../utility.js').makeInspect({ depth: 5, compact: false /* true */ });
const _ = require('lodash');
const Q = require('q');
const mongoose = require('mongoose');
// mongoose.set('debug', true);
const mm = require('music-metadata');

var formatSchema = new mongoose.Schema({
    tagTypes: [String],
    dataformat: String,
    bitsPerSample: Number,
    sampleRate: Number,
    numberOfChannels: Number,
    bitrate: Number,
    lossless: Boolean,
    numberOfSamples: Number,
    duration: Number
});

var commonSchema = new mongoose.Schema({
    track: {
        no: Number,
        of: Number
    },
    disk: {
        no: Number,
        of: Number
    },
    year: String,
    date: String,
    engineer: [String],
    encodedBy: String,
    encodersettings: String,
    title: String,
    album: String,
    artist: String,
    artists: [String],
    genre: [String],
    bpm: String
});

var nativeSchema = new mongoose.Schema({

});

var audioSchema = new mongoose.Schema({
    format: formatSchema,
    common: commonSchema,
    native: nativeSchema    //v mongoose.SchemaTypes.Mixed
});

// Note: linking of artefacts should be possible via just _primary and _primaryType
// audioSchema.virtual('file').set(function(file) {
//     this._file = file;
//     this.fileId = file._id;
// })

audioSchema.plugin(require('./plugin/standard.js'));
audioSchema.plugin(require('./plugin/bulk-save.js'));

// audioSchema.plugin(require('./plugin/artefact.js'), [ 'file' ], ({ file }) => {
//     if (file.path.match(/^[a-z]+.*\.[a-z]$/)) {
//         return this.construct({ file }); 
//     }
// });

// audioSchema.pre('save', function preSave(cb) {

// });

audioSchema.static('loadMetadata', function loadMetadata(file) {
    console.debug(`loadMetadata(file.path=${inspectPretty(file.path)})`);
    return mm.parseFile(file.path, { native: true }).then(metadata => {
        console.debug(`metadata=${inspectPretty(metadata)}`);
        return new (this)(metadata);
    }).catch(err => {
        var e = new Error( `mm.parseFile('${file.path}'): ${/*err.stack||*/err}`);
        e.stack = err.stack;
        console.warn(e.message);//\nmodel._stats:${inspect(model._stats)}`)
        this._stats.loadMetadata.errors.push(e);
        // return audio;
        throw e;
    });
});

// audioSchema.method('toString', function toString(options) {
//     return inspect(this, options || { depth: 0, compact: true });
// })
module.exports = mongoose.model('audio', audioSchema);


// module.exports = modelOptions => mongoose.model(modelOptions.modelName || 'audio', audioSchema)// TODO: Try something like this? to make model names flexible... and then could define an artefact object like:
/*  artefactModel = {
        audio: require('./schemas/audio.js')({
            modelName: 'mongo-collection-name-for-audio-can-be-overridden'
        })
        file: require('./schemas/fs/file.js')()     // by default would name collection/model either file or fs-file or something
    }
*/
// Except in file.js it would call FileSys.discriminator rather than mongoose.model

