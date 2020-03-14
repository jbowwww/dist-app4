
module.exports = PromisePipeError;

function PromisePipeError(pipe, data, err) {
	if (!(this instanceof PromisePipeError)) {
		return new PromisePipeError(pipe, data, err);
	}
	Error.call(this, arguments);
	if (Error.captureStackTrace) {
		Error.captureStackTrace(this, PromisePipeError);
	}
	this.pipe = pipe;
	this.data = data;
	this.err = err;
	this.message = err.message;
	this.stack = err.stack;
	var model = data.prototype;
	if (model && model._stats) {
		model._stats.errors.push(err);
		data.errors._promisePipe = err;
	}
}

PromisePipeError.prototype.constructor = PromisePipeError;
