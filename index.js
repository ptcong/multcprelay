var acorn = require('acorn');
var through = require('through2');
var fs = require('fs');
var path = require('path');

var domProps = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'domprops.json'))).props;
var jqueryProps = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'jqueryprops.json')));

var defaults = {
  bracketDOM: true,
  bracketJQuery: true,
  groupString: true,
  // splitString can be "false", regex, or function that return splited strings
  splitString: /([^\w]|[\[\]\(\):~\s\-_]|(?=[A-Z]))/,
  groupRegex: true,
  shuffle: true,
  debug: false,
  // variables that users often use directly
  groupVars: [
    'window', 'document',
    'navigator', 'screen',
    'Symbol', 'JSON', 'Error', 'RegExp', 'Math', 'Number', 'Date', 'Array', 'Object', 'String',
    'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
    'encodeURI', 'encodeURIComponent', 'decodeURI', 'decodeURIComponent',
    'parseInt', 'isNaN', 'parseFloat'
  ],
  extraProps: [],
  obfuscator: function (header) {
    return header;
  }
};

function Processor(input, options) {
  this.construct(input, options);
}
Processor.prototype = {
  construct: function(input, options) {
    this.options = Object.assign({}, defaults, options || {});
    this.input = input;
    this.vars = {};
    this.counter = 0;
  },
  output: function() {
    var content = this.process();
    var keys = Object.keys(this.vars);

    if (!keys.length) return content;

    if (this.options.shuffle) {
      this.shuffle(keys);
    }

    var header = '';
    for (var i = 0; i < keys.length; i++) {
      if (i === 0) header += 'var ';
      else header += ',';

      if (this.options.debug) {
        header += '\n' + this.vars[keys[i]] + ' = ' + keys[i];
      } else {
        header += this.vars[keys[i]] + '=' + keys[i];
      }
    }
    if (keys.length) header += ';';

    if (this.options.obfuscator) {
      header = this.options.obfuscator.call(null, header);
    }

    var out = '!function(){';
    out += header;
    out += '!function(){' + content + '}();'
    out += '}();';

    return out;
  },
  shuffle: function(array) {
    var j;
    var x;
    var i;
    for (i = array.length; i; i--) {
      j = Math.floor(Math.random() * i);
      x = array[i - 1];
      array[i - 1] = array[j];
      array[j] = x;
    }
  },
  process: function() {
    var opts = {
      strictSemicolons: true
    };
    var stack = [];
    var out = '';

    for (var token of acorn.tokenizer(this.input, opts)) {
      stack.push(token);

      if (stack.length === 1) {
        out += this.handle(stack, 0);
      } else if (stack.length > 2) {
        out += this.handle(stack, 1);
        stack.shift();
      }
    }

    if (stack.length > 1) {
      out += this.handle(stack, 1);
    }
    return out;
  },
  varExport: function(value) {
    return JSON.stringify(value);
  },
  genVar: function() {
    return '_' + (++this.counter);
  },
  swap: function(value, sensitive, noGroup) {
    var self = this;
    var parts = [];
    var vars = [];

    if (!sensitive && typeof value == 'string' && value.length && !/^(''|"")$/.test(value) && this.options.splitString) {
      value = JSON.parse(value);

      if (typeof this.options.splitString == 'function') {
        parts = this.options.splitString(value);
      } else if (this.options.splitString.test(value)) {
        parts = value.split(this.options.splitString);
      }
      if (!parts.length) {
        parts = [value];
      }

      parts.forEach(function(v, i) {
        if (v.length)
          vars.push(self.swap(self.varExport(v), true));
      });

      return noGroup || vars.length < 2
        ? vars.join('+')
        : '(' + vars.join('+') + ')';
    }

    if (typeof this.vars[value] == 'undefined') {
      this.vars[value] = this.genVar();;
    }

    return this.vars[value];
  },
  shouldBracket: function (value) {
    return this.options.bracketDOM && domProps.indexOf(value) > -1
      || this.options.bracketJQuery && jqueryProps.indexOf(value) > -1
      || this.options.extraProps && this.options.extraProps.indexOf(value) > -1;
  },
  handle: function(stack, i) {
    var self = this;
    var out = '';
    var token = stack[i];
    var raw = this.tokenValue(token);
    var value = raw;
    var prev = stack[i - 1] || false;
    var next = stack[i + 1] || false;

    if (this.bracket) {
      value = this.varExport(raw);
      value = '[' + (this.options.groupString ? this.swap(value, false, true) : value) + ']';
      this.bracket = false;
    }
    //
    else if ((this.options.bracketDOM || this.options.bracketJQuery) && token.type.label == '.' && next && this.shouldBracket(this.tokenValue(next))) {
      value = '';
      this.bracket = true;
    } else if (this.options.groupRegex && token.type.label === 'regexp') {
      value = this.swap(value, true);
    }
    //
    else if (token.type.label === 'string') {
      value = this.varExport(raw);

      if (this.options.groupString && !/^use\s+strict$/.test(raw)) {
        // is not a object property
        if (!([',', '{', '.'].indexOf(this.tokenValue(prev)) > -1 && this.tokenValue(next) == ':')) {
          var noGroup = ['(', '['].indexOf(this.tokenValue(prev)) != -1 && [')', ']'].indexOf(this.tokenValue(next)) != -1;

          value = this.swap(value, false, noGroup);
        }
      }
    }
    //
    else if (this.options.groupVars
      && (!prev || prev && this.tokenValue(prev) != '.')
      && this.options.groupVars.indexOf(value) > -1
      && (!next || next && [':', '='].indexOf(this.tokenValue(next)) == -1)
    ) {
      value = this.swap(value, true);
    }

    if (prev) {
      out += this.input.substr(prev.end, token.start - prev.end) || '';
    }

    out += value;

    // in case jquery.min.js "length"in
    if (token.type.label === 'string' && next && next.type.keyword && token.end === next.start ||
      next && token.type.keyword && token.end === next.start
    ) {
      out += ' ';
    }

    return out;
  },
  tokenValue: function(token) {
    var value = token.value;

    // keyword
    if (typeof value === 'undefined') {
      return token.type.label;
    }
    // is regex
    if (typeof value.pattern !== 'undefined') {
      return value.value;
    }
    // normal string
    return value.toString();
  }
}

var jsbracket = function(options) {
  return through.obj(function(file, encoding, callback) {
    var content = String(file.contents);
    content = new Processor(content, options).output();
    file.contents = new Buffer(content);

    return callback(null, file);
  });
};

jsbracket.process = function(content, options) {
  return new Processor(content, options).output();
}

module.exports = jsbracket;
