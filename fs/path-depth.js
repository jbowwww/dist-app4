"use strict";
module.exports = function pathDepth(path) {
	return path.split(/(\/|\\)\.*/).length;
}
