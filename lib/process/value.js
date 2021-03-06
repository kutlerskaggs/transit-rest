'use strict';

const async = require('async');
const intercept = require('./intercept');
const util = require('../utils');
const _ = require('lodash');


/**
 * Process an expression/value
 * @param  {Object} service - the active service
 * @param  {String} field - field name
 * @param  {*} expression - the expression to process
 * @param  {Object} options
 * @param  {Function} cb
 */
module.exports = function processValue(service, field, expression, options, cb) {
    const err = service._error;

    if (!util.isExpression(expression)) {
        return intercept(field, expression, options, cb);
    }

    let keys = Object.keys(expression);
    async.reduce(keys, {}, function(result, modifierName, fn) {
        let modifier = _.get(options, `modifiers.${modifierName}`);
        let value = expression[modifierName];

        if (!modifier || modifier === false) {
            return async.setImmediate(function() {
                fn(err.badRequest(`Undefined/Forbidden modifier found in query filter: ${modifierName}`));
            });
        }

        async.waterfall([
            // if value is a nested expression, we need to process it recursively
            function applyNestedModifier(_fn) {
                processValue(service, field, value, options, _fn);
            },

            // process value with the current modifier
            function applyModifier(processed, _fn) {
                if (modifier === true) {
                    return async.setImmediate(function() {
                        result[modifierName] = processed;
                        _fn(null, result);
                    });
                }
                if (_.isFunction(modifier)) {
                    return modifier(field, processed, function(err, r) {
                        if (err) {
                            return _fn(err);
                        }
                        if (!util.isExpression(r)) {
                            return _fn(null, r);
                        }
                        _.extend(result, r);
                        _fn(null, result);
                    });
                }
                async.setImmediate(function() {
                    _fn(err.serverError(`Invalid modifier defined for '${modifierName}', must be a boolean or a function`));
                });
            }
        ], fn);
    }, cb);
};
