

var Teacup = {};


// TOKEN TYPES

Teacup.tokenDefinitions = {
    number: "\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?",
    open: "[\\(\\[\\{]|\\b(?:let|for|if|begin)\\b",
    middle: "\\b(?:then|elif|else|in|do|when)\\b",
    close: "[\\)\\]\\}]|\\bend\\b",
    infix: "[,;\n]|[!@$%^&*|/?.:~+=<>-]+|\\b(?:and|or|not)\\b",
    word: "\\w+",
    string: "\"(?:[^\"]|\\\\.)*\"",
    comment: "#[^\n]*(?=\n|$)"
};


// PRIORITIES
function lassoc(n) { return {left: n, right: n - 1}; }
function rassoc(n) { return {left: n, right: n + 1}; }
function xassoc(n) { return {left: n, right: n}; }
function prefix(n) { return {left: n, right: 10004}; }
function suffix(n) { return {left: 10005, right: n}; }

Teacup.priorities = {

    // Brackets and control structures
    "type:open":     prefix(5),
    "type:middle":   xassoc(5),
    "type:close":    suffix(5),

    // Lists
    "\n":            xassoc(15),
    ";":             xassoc(15),
    ",":             xassoc(25),

    // Assignment
    "=":             rassoc(35),

    // Lambda
    "->":            rassoc(35),

    // Comparison and logic
    "not":           prefix(105),
    "or":            lassoc(115),
    "and":           lassoc(125),
    ">":             xassoc(205),
    "<":             xassoc(205),
    ">=":            xassoc(205),
    "<=":            xassoc(205),
    "==":            xassoc(205),

    // Range
    "..":            xassoc(305),

    // Basic arithmetic
    "+":             lassoc(505),
    "-":             lassoc(505),
    "prefix:-":      prefix(605),
    "*":             lassoc(605),
    "/":             lassoc(605),
    "%":             lassoc(605),
    "^":             rassoc(705),

    // Other operators
    "type:infix":    xassoc(905),
    "type:prefix":   prefix(905),

    // Field access
    ".":             {left: 15005, right: 1004},

    // atoms
    "type:word":     xassoc(20005),
    "type:number":   xassoc(20005),
    "type:string":   xassoc(20005),
};


// ROOT ENVIRONMENT

function lazy(fn) { fn.lazy = true; return fn; }

Teacup.rootEnv = {
    true: true,
    false: false,
    null: null,
    "+": (a, b) => a + b,
    "-": (a, b) => a - b,
    "prefix:-": a => -a,
    "*": (a, b) => a * b,
    "/": (a, b) => a / b,
    "%": (a, b) => a % b,
    "^": Math.pow,
    "<": (a, b) => a < b,
    ">": (a, b) => a > b,
    "<=": (a, b) => a <= b,
    ">=": (a, b) => a >= b,
    "==": (a, b) => a == b,
    "..": (start, end) =>
        Array.apply(null, Array(end - start)).map((_, i) => i + start),
    "prefix:not": a => !a,
    "and": lazy((a, b) => a() && b()),
    "or": lazy((a, b) => a() || b()),
    Math: Math
}


// HANDLERS

Teacup.handlers = [];

// Helper functions (used by more than one handler)
function resolve(env, text) {
    if (text in env)
        return env[text];
    else
        throw ReferenceError("Undefined variable: '"+text+"'.");
}
function getField(obj, field) {
    var res = obj[field];
    if (typeof(res) === "function")
        // This is necessary for method calls to work.
        return res.bind(obj);
    return res;
}
function runCall(interpreter, node, env) {
    var res = normalizeCall(node);
    var fn = interpreter.eval(res[0], env);
    var args = res[1].map(x => () => interpreter.eval(x, env))
    if (fn.lazy)
        return fn.apply(interpreter, args);
    else
        return fn.apply(interpreter, args.map(t => t()));
}
function variableBinder(expr, env) {
    if (expr.type !== "word" && expr.type !== "infix" && expr.type !== "prefix")
        throw SyntaxError("Invalid variable declaration.");
    var pfx = expr.type === "prefix" ? "prefix:" : ""
    return function (value) {
        env[pfx + expr.text] = value;
    }
}
function buildFunction(self, decls, body, env) {
    return function () {
        var arguments = [].slice.call(arguments);
        var newEnv = Object.create(env);
        for (var decl of decls) {
            variableBinder(decl, newEnv)(arguments.shift());
        }
        return self.eval(body, newEnv);
    }
}

// Variables
Teacup.handlers.push({
    key: /^(word|infix)$/,
    func: (node, env) => resolve(env, node.text)
});

// Prefix operators
Teacup.handlers.push({
    key: "prefix",
    func: (node, env) => resolve(env, "prefix:" + node.text)
});

// Numbers
Teacup.handlers.push({
    key: "number",
    func: (node, env) => parseFloat(node.text)
});

// Strings
Teacup.handlers.push({
    key: "string",
    func: (node, env) => node.text.slice(1, -1)
});

// Simple operators
Teacup.handlers.push({
    key: /^[E_] ([!@#$%^&*+\/?<>=.-]+|and|or|not) E$/,
    func: function (node, env) {
        return runCall(this, node, env);
    }
});

// Parentheses evaluate what's between them
Teacup.handlers.push({
    key: "_ ( E ) _",
    func: function (node, env, x) {
        return this.eval(x, env);
    }
});

// Ditto for begin/end
Teacup.handlers.push({
    key: "_ begin E end _",
    func: function (node, env, x) {
        return this.eval(x, env);
    }
});

// Function calls
Teacup.handlers.push({
    key: "E ( E ) _",
    func: function (node, env) {
        return runCall(this, node, env);
    }
});

// Function call (no arguments)
Teacup.handlers.push({
    key: "E ( _ ) _",
    func: function (node, env, f) {
        return this.eval(f, env).call(this)
    }
});

// List notation [a, b, c, ...]
Teacup.handlers.push({
    key: "_ [ E ] _",
    func: function (node, env, x) {
        return getList(x).map(arg => this.eval(arg, env));
    }
});

// Empty list
Teacup.handlers.push({
    key: "_ [ _ ] _",
    func: (node, env) => []
});

// Indexing; we make it so that x[1, 2] <=> x[1][2]
Teacup.handlers.push({
    key: "E [ E ] _",
    func: function (node, env, obj, index) {
        return getList(index).reduce(
            (res, x) => getField(res, this.eval(x, env)),
            this.eval(obj));
    }
});

// Dot notation
Teacup.handlers.push({
    key: "E . E",
    func: function (node, env, obj, field) {
        var x = this.eval(obj, env);
        var f = field.type === "word" ?
            field.text :
            this.eval(field, env);
        return getField(x, f);
    }
});

// if x then y else z end
Teacup.handlers.push({
    key: /^_ if E then E( elif E then E)*( else E)? end _$/,
    func: function (node, env) {
        var exprs = [].slice.call(arguments, 2);
        while (exprs.length > 0) {
            if (exprs.length === 1)
                return this.eval(exprs[0], env);
            if (this.eval(exprs.shift(), env))
                return this.eval(exprs.shift(), env);
            else
                exprs.shift();
        }
    }
});

// sequences; of; statements
Teacup.handlers.push({
    key: /[,;\n]/,
    func: function (node, env) {
        var last = undefined;
        for (stmt of [].slice.call(arguments, 2)) {
            last = this.eval(stmt, env);
        }
        return last;
    }
});

// Anonymous functions: args -> body
Teacup.handlers.push({
    key: "E -> E",
    func: function (node, env, decl, body) {
        var args = getList(unparenthesize(decl));
        return buildFunction(this, args, body, env);
    }
});

// let x = y in z end
Teacup.handlers.push({
    key: "_ let E in E end _",
    func: function (node, env, rawDecls, body) {
        var decls = getList(rawDecls)
            .map(d => normalizeAssignment(d));
        var newEnv = Object.create(env);
        for (var decl of decls) {
            var value =
                decl[1]
                ? buildFunction(this, decl[1], decl[2], newEnv)
                : this.eval(decl[2], env);
            variableBinder(decl[0], newEnv)(value);
        }
        return this.eval(body, newEnv);
    }
});

function forHandler(v, list, cond, body, env) {
    var results = [];
    for (var x of this.eval(list, env)) {
        var newEnv = Object.create(env);
        variableBinder(v, newEnv)(x);
        if (!cond || this.eval(cond, newEnv)) {
            results.push(this.eval(body, newEnv));
        }
    }
    return results;
}

// for x in y do z end
Teacup.handlers.push({
    key: "_ for E in E do E end _",
    func: function (node, env, v, list, body) {
        return forHandler.call(this, v, list, null, body, env);
    }
});

// for x in y when c do z end
Teacup.handlers.push({
    key: "_ for E in E when E do E end _",
    func: function (node, env, v, list, cond, body) {
        return forHandler.call(this, v, list, cond, body, env);
    }
});


function teacup(source) {
    var lexer = new Lexer(Teacup.tokenDefinitions);
    var parser = new Parser(Teacup.priorities, finalize);
    var env = makeEnvironment(Teacup.rootEnv);
    var interpreter = new Interpreter(Teacup.handlers, env);
    var pipeline = new Pipeline(
        lexer,
        tagPrefixOperators,
        parser,
        interpreter
    )
    return pipeline.process(source);
}
