# Gulp JSBracket

- Convert dot notation style to bracket style. Example: window.navigator => window["navigator"]
- Group strings, vars, regexes for saving disk spaces, also make your code harder to read but won't slow it down.

When `groupString` and bracket is enabed

```
window.navigator;
document.body;
```

above code will be

```
var a = "navigator", b ="body";

window[a];
document[b];
```

and if use with `groupVars`, it will be

```
var a = "navigator", b ="body", c = window, d = document;

c[a];
d[b];
```

Use this with uglifyjs then you don't need any other obufscator.

## Installation

`npm install jsbracket --save`

## Usage

```
var gulp = require('gulp');
var jsbracket = require('jsbracket');

gulp.task('default', function () {
  return gulp.src('template.js')
    .pipe(jsbracket({
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
        'Error', 'RegExp', 'Math', 'Number', 'Date', 'Array', 'Object', 'String',
        'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
        'encodeURI', 'encodeURIComponent', 'decodeURI', 'decodeURIComponent',
        'parseInt', 'isNaN', 'parseFloat'
      ]
    }))
    .pipe(gulp.dest('dist'));
});

```
