"use strict";

import { make_js } from './lib/generator';
import { optimize } from './lib/optimizer';
import { parse, InputStream, TokenStream }from './lib/parser'
import { to_cps } from './lib/transformer';


let STACKLEN, IN_EXECUTE = false;
function GUARD(args, f) {
    if (--STACKLEN < 0) throw new Continuation(f, args);
}
function Continuation(f: any, args: any) {
    this.f = f;
    this.args = args;
}
function Execute(f, args) {
  if (IN_EXECUTE)
      return f.apply(null, args);
  IN_EXECUTE = true;
  while (true) try {
      STACKLEN = 200;
      f.apply(null, args);
      break;
  } catch(ex) {
      if (ex instanceof Continuation) {
          f = ex.f, args = ex.args;
      } else {
          IN_EXECUTE = false;
          throw ex;
      }
  }
  IN_EXECUTE = false;
}


/* -----[ NodeJS CLI test ]----- */

if (typeof process != "undefined") (function(){
    var u2 = require("uglify-js");
    var sys = require("util");
    var print = function(k) {
        sys.puts([].slice.call(arguments, 1).join(" "));
        k(false);
    };
    function readStdin(callback) {
        var text = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("readable", function(){
            var chunk = process.stdin.read();
            if (chunk) text += chunk;
        });
        process.stdin.on("end", function(){
            callback(text);
        });
    }
    readStdin(function(code){
        var ast = parse(TokenStream(InputStream(code)));
        var cps = to_cps(ast, function(x){
            return {
                type: "call",
                func: { type: "var", value: "尾_TOPLEVEL" },
                args: [ x ]
            };
        });

        //console.log(sys.inspect(cps, { depth: null }));

        var opt = optimize(cps);
        //var opt = cps; make_scope(opt);
        var jsc = make_js(opt);

        jsc = "var 尾_TMP;\n\n" + jsc;

        if (opt.env) {
            var vars = Object.keys(opt.env.vars);
            if (vars.length > 0) {
                jsc = "var " + vars.map(function(name){
                    return make_js({
                        type: "var",
                        value: name
                    });
                }).join(", ") + ";\n\n" + jsc;
            }
        }

        jsc = '"use strict";\n\n' + jsc;

        try {
            sys.error(u2.parse(jsc).print_to_string({
                beautify: true,
                indent_level: 2
            }));
        } catch(ex) {
            console.log(ex);
            throw(ex);
        }

        //sys.error(jsc);

        sys.error("\n\n/*");
        var func = new Function("尾_TOPLEVEL, GUARD, print, require, Execute", jsc);
        console.time("Runtime");
        Execute(func, [
            function(result){
                console.timeEnd("Runtime");
                sys.error("***Result: " + result);
                sys.error("*/");
            },
            GUARD,
            print,
            require,
            Execute
        ]);
    });
})();
