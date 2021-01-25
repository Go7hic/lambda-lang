import { FALSE } from './const'


export function makeJS(exp: any) {
  return js(exp);

  function js(exp) {
      switch (exp.type) {
        case "num"    :
        case "str"    :
        case "bool"   : return jsAtom(exp);
        case "var"    : return jsVar(exp);
        case "not"    : return jsNot(exp);
        case "binary" : return jsBinary(exp);
        case "assign" : return jsAssign(exp);
        case "let"    : return jsLet(exp);
        case "lambda" : return jsLambda(exp);
        case "if"     : return jsIf(exp);
        case "prog"   : return jsProg(exp);
        case "call"   : return jsCall(exp);
        case "raw"    : return jsRaw(exp);
        default:
          throw new Error("Dunno how to make_js for " + JSON.stringify(exp));
      }
  }
  function jsRaw(exp: { code: string; }) {
      return "(" + exp.code +")";
  }
  function jsAtom(exp: { value: any; }) {
      return JSON.stringify(exp.value); // cheating ;-)
  }
  function makeVar(name: any) {
      return name;
  }
  function jsVar(exp: { value: any; }) {
      return makeVar(exp.value);
  }
  function jsNot(exp: { body: { type: any; then: any; else: any; operator: string; left: any; right: any; }; }) {
      if (isBool(exp.body))
          return "!" + js(exp.body);
      return "(" + js(exp.body) + " === false)";
  }
  function jsBinary(exp) {
      var left = js(exp.left);
      var right = js(exp.right);
      switch (exp.operator) {
        case "&&":
          if (isBool(exp.left)) break;
          return "((" + left + " !== false) && " + right + ")";
        case "||":
          if (isBool(exp.left)) break;
          return "((尾_TMP = " + left + ") !== false ? 尾_TMP : " + right + ")";
      }
      return "(" + left + exp.operator + right + ")";
  }
  function jsAssign(exp) {
      return jsBinary(exp);
  }
  function jsLambda(exp) {
      var code = "(function ", CC;
      if (!exp.unguarded) {
          CC = exp.name || "尾_CC";
          code += makeVar(CC);
      }
      code += "(" + exp.vars.map(makeVar).join(", ") + ") {";
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
  function jsLet(exp: { type?: any; func?: { type: string; vars: any[]; body: { type: string; vars: any; body: any; }; }; args?: any[]; vars?: any; body?: any; }) {
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
  function isBool(exp: { type: any; then: any; else: any; operator: string; left: any; right: any; }) {
      switch (exp.type) {
        case "bool":
        case "not":
          return true;
        case "if":
          return isBool(exp.then) || (exp.else && isBool(exp.else));
        case "binary":
          if (",<,<=,==,!=,>=,>,".indexOf("," + exp.operator + ",") >= 0)
              return true;
          if (exp.operator == "&&" || exp.operator == "||")
              return isBool(exp.left) && isBool(exp.right);
          break;
      }
      return false;
  }
  function jsIf(exp) {
      var cond = js(exp.cond);
      if (!isBool(exp.cond))
          cond += " !== false";
      return "("
          +      cond
          +      " ? " + js(exp.then)
          +      " : " + js(exp.else || FALSE)
          +  ")";
  }
  function jsProg(exp) {
      return "(" + exp.prog.map(js).join(", ") + ")";
  }
  function jsCall(exp) {
      return js(exp.func) + "(" + exp.args.map(js).join(", ") + ")";
  }
}
