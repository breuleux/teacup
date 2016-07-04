

// PIPELINE

function Pipeline(...steps) {
    this.steps = steps;
}

Pipeline.prototype.process = function (x) {
    for (var step of this.steps) {
        if (typeof(step) === "function")
            x = step(x);
        else
            x = step.process(x);
    }
    return x;
}


// LEXER

function Lexer(tokenDefinitions) {
    // Build a big ass regular expression
    var keys = Object.keys(tokenDefinitions);
    var regexps = keys.map(k => tokenDefinitions[k]);
    this.re = new RegExp("(" + regexps.join(")|(") + ")");
    // this.types associates each group in the regular expression
    // to a token type (group 0 => not matched => null)
    this.types = [null].concat(keys);
}

Lexer.prototype.process = function(text) {
    var pos = 0;
    // Splitting with a regular expression inserts the matching
    // groups between the splits.
    return text.split(this.re)
        .map((token, i) => ({
            type: this.types[i % this.types.length], // magic!
            text: token,
            start: pos,
            end: pos += (token || "").length
        }))
        .filter(t => t.type && t.type !== "comment" && t.text) // remove empty tokens
}


// PARSER

function Parser(priorities, finalize) {
    this.priorities = Object.assign(Object.create(null), priorities);
    this.finalize = finalize;
}

Parser.prototype.getPrio = function (t) {
    var x = this.priorities[t.type + ":" + t.text]
         || this.priorities[t.text]
         || this.priorities["type:" + t.type]
    if (x) return x;
    else throw SyntaxError("Unknown operator: " + t.text);
}

Parser.prototype.order = function (a, b) {
    if (!a && !b) return "done";
    if (!a) return 1;
    if (!b) return -1;
    var pa = this.getPrio(a).left;
    var pb = this.getPrio(b).right;
    return Math.sign(pb - pa);
}

Parser.prototype.process = function (tokens) {
    tokens = tokens.slice();
    var next = tokens.shift.bind(tokens);
    var stack = [];
    // middle points to the handle between the two
    // operators we are currently comparing
    // (null if the two tokens are consecutive)
    var middle = null;
    var left = undefined;
    var right = next();
    var current = [null, left];
    while (true) {
        switch (this.order(left, right)) {
        case "done":
            // Returned when left and right are both
            // undefined (out of bounds)
            return middle;
        case 1:
            // Open new handle; it's like inserting
            // "(" between left and middle
            stack.push(current);
            current = [middle, right];
            middle = null;
            left = right;
            right = next();
            break;
        case -1:
            // Close current handle; it's like inserting
            // ")" between middle and right and then
            // the newly closed block becomes the new middle
            current.push(middle);
            middle = this.finalize(current);
            current = stack.pop();
            left = current[current.length - 1];
            break;
        case 0:
            // Merge to current handle and keep going
            current.push(middle, right);
            middle = null;
            left = right;
            right = next();
            break;
        }
    }
}


// STANDARD FINALIZER

function finalize(node) {
    var l = node.length;
    if (l === 3 && !node[0] && !node[2])
        return node[1];
    return {type: node.map((x, i) => {
        if (i % 2 == 0)
            return x === null ? "_" : "E"
        else 
            return x.text
    }).join(" "),
            args: node.filter((x, i) => x && i % 2 == 0),
            ops: node.filter((x, i) => i % 2 == 1),
            start: node[0] ? node[0].start : node[1].start,
            end: node[l-1] ? node[l-1].end : node[l-2].end};
}



// ENVIRONMENT

function makeEnvironment(...bindingGroups) {
    var base = Object.create(null);
    for (var bindings of bindingGroups)
        Object.assign(base, bindings);
    return base;
}



// UTILITIES

function extractArgs(guard, node, strict) {
    // extractArgs("E = E", `a = b`)        ==> [a, b]
    // extractArgs("E = E", `a + b`)        ==> null
    // extractArgs("E = E", `a + b`, true)  ==> ERROR
    // extractArgs(/^E [/]+ E$/, `a /// b`) ==> [a, b]
    if (guard === node.type
        || guard instanceof RegExp && node.type.match(guard))
        return node.args || [];
    if (strict)
        throw Error("Expected '"+guard+"', got '"+node.type+"'");
    return null;
}

function unparenthesize(node) {
    var res = extractArgs("_ ( E ) _", node);
    return res ? res[0] : node;
}

function getList(node) {
    // getList(`a, b, c`) ==> [a, b, c]
    // getList(`a`)       ==> [a]
    return extractArgs(/^[E_]( [;,\n] [E_])+$/, node)
        || (node ? [node] : []);
}

function normalizeCall(node) {
    // normalizeCall(`a + b`)   ==> [+, [a, b]]
    // normalizeCall(`f(a, b)`) ==> [f, [a, b]]
    var args = extractArgs(/^[E_] [^ ]+ [E_]$/, node);
    if (args)
        return [node.ops[0], args];
    else if (args = extractArgs(/^E \( [E_] \) _$/, node))
        return [args[0], getList(args[1])];
    return null;
}

function normalizeAssignment(node) {
    // normalizeAssignment(`a = b`)    ==> [a, null, b]
    // normalizeAssignment(`f(a) = b`) ==> [f, [a], b]
    var lr = extractArgs("E = E", node, true);
    var fargs = normalizeCall(lr[0]);
    if (fargs)
        return [fargs[0], fargs[1], lr[1]];
    else
        return [lr[0], null, lr[1]];
}


// INTERPRETER

function Interpreter(handlers, env) {
    // We reverse the handlers so that the most recent
    // have precedence over the rest.
    this.handlers = handlers.slice().reverse();
    this.env = env;
}
Interpreter.prototype.eval = function (node, env) {
    for (var h of this.handlers) {
        var args = extractArgs(h.key, node, false);
        if (args)
            return h.func.apply(this, [node, env].concat(args));
    }
    throw SyntaxError("Unknown node type: " + node.type);
}
Interpreter.prototype.process = function (node) {
    return this.eval(node, this.env);
}


// PREFIX OPERATORS

function tagPrefixOperators(tokens) {
    var prevType = "infix";
    for (var token of tokens) {
        if (token.type === "infix" &&
            (prevType === "infix" || prevType === "open")) {
            prevType = token.type;
            token.type = "prefix";
        }
        else
            prevType = token.type;
    }
    return tokens;
}
