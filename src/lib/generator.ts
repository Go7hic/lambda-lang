import { FALSE } from './const'

export function make_js(exp) {
  return js(exp);

  function js(exp) {
      switch (exp.type) {
        case "num"    :
        case "str"    :
        case "bool"   : return js_atom   (exp);
        case "var"    : return js_var    (exp);
        case "not"    : return js_not    (exp);
        case "binary" : return js_binary (exp);
        case "assign" : return js_assign (exp);
        case "let"    : return js_let    (exp);
        case "lambda" : return js_lambda (exp);
        case "if"     : return js_if     (exp);
        case "prog"   : return js_prog   (exp);
        case "call"   : return js_call   (exp);
        case "raw"    : return js_raw    (exp);
        default:
          throw new Error("Dunno how to make_js for " + JSON.stringify(exp));
      }
  }
  function js_raw(exp) {
      return "(" + exp.code +")";
  }
  function js_atom(exp) {
      return JSON.stringify(exp.value); // cheating ;-)
  }
  function make_var(name) {
      return name;
  }
  function js_var(exp) {
      return make_var(exp.value);
  }
  function js_not(exp) {
      if (is_bool(exp.body))
          return "!" + js(exp.body);
      return "(" + js(exp.body) + " === false)";
  }
  function js_binary(exp) {
      var left = js(exp.left);
      var right = js(exp.right);
      switch (exp.operator) {
        case "&&":
          if (is_bool(exp.left)) break;
          return "((" + left + " !== false) && " + right + ")";
        case "||":
          if (is_bool(exp.left)) break;
          return "((尾_TMP = " + left + ") !== false ? 尾_TMP : " + right + ")";
      }
      return "(" + left + exp.operator + right + ")";
  }
  function js_assign(exp) {
      return js_binary(exp);
  }
  function js_lambda(exp) {
      var code = "(function ", CC;
      if (!exp.unguarded) {
          CC = exp.name || "尾_CC";
          code += make_var(CC);
      }
      code += "(" + exp.vars.map(make_var).join(", ") + ") {";
      if (exp.locs && exp.locs.length > 0) {
          code += "var " + exp.locs.join(", ") + ";";
      }
      if (!exp.unguarded) {
          code += "GUARD(arguments, " + CC + "); ";

          // 12% faster in Firefox, no effect in Chrome:
          //code += "if (--STACKLEN < 0) throw new Continuation(" + CC + ", arguments);";

          // 2x faster in Firefox, but slower in Chrome:
          //code += "if (--STACKLEN < 0) throw new Continuation(" + CC + ", [ " + exp.vars.map(make_var).join(", ") + " ]);";
      }
      code += js(exp.body) + " })";
      return code;
  }
  function js_let(exp) {
      if (exp.vars.length == 0)
          return js(exp.body);
      var iife = {
          type: "call",
          func: {
              type: "lambda",
              vars: [ exp.vars[0].name ],
              body: {
                  type: "let",
                  vars: exp.vars.slice(1),
                  body: exp.body
              }
          },
          args: [ exp.vars[0].def || FALSE ]
      };
      return "(" + js(iife) + ")";
  }
  function is_bool(exp) {
      switch (exp.type) {
        case "bool":
        case "not":
          return true;
        case "if":
          return is_bool(exp.then) || (exp.else && is_bool(exp.else));
        case "binary":
          if (",<,<=,==,!=,>=,>,".indexOf("," + exp.operator + ",") >= 0)
              return true;
          if (exp.operator == "&&" || exp.operator == "||")
              return is_bool(exp.left) && is_bool(exp.right);
          break;
      }
      return false;
  }
  function js_if(exp) {
      var cond = js(exp.cond);
      if (!is_bool(exp.cond))
          cond += " !== false";
      return "("
          +      cond
          +      " ? " + js(exp.then)
          +      " : " + js(exp.else || FALSE)
          +  ")";
  }
  function js_prog(exp) {
      return "(" + exp.prog.map(js).join(", ") + ")";
  }
  function js_call(exp) {
      return js(exp.func) + "(" + exp.args.map(js).join(", ") + ")";
  }
}
