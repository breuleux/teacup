

///////////////////
// DISPLAY STUFF //
///////////////////

Teacup.rootEnv["log"] = function () {
    [].slice.call(arguments).forEach(function (arg) {
        var box = document.createElement("div");
        box.appendChild(document.createTextNode(arg));
        document.getElementById("result").appendChild(box);
    });
    return arguments[arguments.length - 1];
}

function makeNode(type, cls) {
    var box = document.createElement(type);
    box.className = cls;
    [].slice.call(arguments, 2).forEach(function (x) {
        box.appendChild(x);
    });
    return box;
}
function txt(t) {
    return document.createTextNode(t);
}

function simplify(node) {
    if (node[1].text.match(/[,;\n]/)) {
        var results = [];
        for (var i = 0; i < node.length; i++) {
            if (node[i] === null) {
                if (results.pop() === undefined) i++;
            }
            else results.push(node[i]);
        }
        return results;
    }
    return node;
}

function display(node) {
    if (!node) {
        return makeNode("span", "nil");
    }
    if (node.length === 3 && node[0] === null && node[2] === null) {
        return makeNode("span", node[1].type, txt(node[1].text));
    }
    node = simplify(node);
    if (node.length === 1) { return node[0]; }
    console.log(node);
    var box = makeNode("span", "inner");
    node.forEach(function (x, i) {
        if (i % 2 == 1) {
            var op = makeNode("span", "op", txt(x.text.replace("\n", "↵")));
            box.appendChild(op);
        }
        else
            box.appendChild(x || txt(""));
    });
    return box;
}

var displayPipeline = new Pipeline(
    new Lexer(Teacup.tokenDefinitions),
    tagPrefixOperators,
    new Parser(Teacup.priorities, display)
)

function processInput() {
    var s = document.getElementById("expr").value;
    var res = document.getElementById("ast");
    res.innerHTML = "";
    res.appendChild(displayPipeline.process(s));
    var res = document.getElementById("result");
    res.innerHTML = "";
    try {
        res.appendChild(txt(teacup(s)));
    }
    catch (e) {
        res.appendChild(txt("ERROR: " + e.message));
    }
}

function runDemo() {
    var inputbox = document.getElementById("expr");
    var examples = document.getElementById("examples");
    [].slice.call(examples.children).forEach(function (child, i) {
        var button = document.createElement("button");
        button.appendChild(txt(i || "Clear"));
        button.onclick = function (e) {
            inputbox.value = child.value;
        };
        examples.replaceChild(button, child);
        if (i === 1) { inputbox.value = child.value; }
    });

    document.getElementById("evaluate").onclick = processInput;
}
