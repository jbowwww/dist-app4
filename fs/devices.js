"use strict";

const log = require('@jbowwww/log');
const inspect = require('../utility.js').makeInspect({ depth: 2, breakLength: 0 });
const { cmd } = require('@jbowwww/shell');

module.exports = async function getDevices() {
	const { stdout, stderr } = await cmd('lsblk -JO');
	log.debug(`stdout='${stdout}' stderr='${stderr}'`);
	const devices = JSON.parse(stdout).blockdevices;
	log.debug(`getDevices(): devices = ${inspect(devices)}`);
	return devices;
};
