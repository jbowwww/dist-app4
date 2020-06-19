"use strict";

const console = require('@jbowwww/log');
const inspect = require('../utility.js').makeInspect({ depth: 2, breakLength: 0 });
const util = require('util');
const exec = util.promisify(require('child_process').exec)

module.exports = async function getDevices() {
	try {
		const cmd = 'lsblk -JO';
		const devices = JSON.parse(stdout).blockdevices;
		console.verbose(`getDevices(): devices = ${inspect(devices)}`);
		return devices;
	} catch (e) {
		
};
