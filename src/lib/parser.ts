import { FALSE } from './const';

export function parse(input) {

  const PRECEDENCE = {
      "=": 1,
      "||": 2,
      "&&": 3,
      "<": 7, ">": 7, "<=": 7, ">=": 7, "==": 7, "!=": 7,
      "+": 10, "-": 10,
      "*": 20, "/": 20, "%": 20,
  };
  return parseToplevel();

  function isPunc(ch: any) {
      var tok = input.peek();
      return tok && tok.type == "punc" && (!ch || tok.value == ch) && tok;
  }

  function isKw(kw: any) {
      var tok = input.peek();
      return tok && tok.type == "kw" && (!kw || tok.value == kw) && tok;
  }
  function isOp(op?:any) {
      var tok = input.peek();
      return tok && tok.type == "op" && (!op || tok.value == op) && tok;
  }
  function skipPunc(ch: string) {
      if (isPunc(ch)) input.next();
      else input.croak("Expecting punctuation: \"" + ch + "\"");
  }
  function skipKw(kw: string) {
      if (isKw(kw)) input.next();
      else input.croak("Expecting keyword: \"" + kw + "\"");
  }
  // function skip_op(op) {
  //     if (is_op(op)) input.next();
  //     else input.croak("Expecting operator: \"" + op + "\"");
  // }
  function unexpected() {
      input.croak("Unexpected token: " + JSON.stringify(input.peek()));
  }
  function maybeBinary(left, myPrec) {
      var tok = isOp();
      if (tok) {
          var his_prec = PRECEDENCE[tok.value];
          if (his_prec > myPrec) {
              input.next();
              return maybeBinary({
                  type     : tok.value == "=" ? "assign" : "binary",
                  operator : tok.value,
                  left     : left,
                  right    : maybeBinary(parseAtom(), his_prec)
              }, myPrec);
          }
      }
      return left;
  }

  function delimited(start, stop, separator, parser) {
      var a = [], first = true;
      skipPunc(start);
      while (!input.eof()) {
          if (isPunc(stop)) break;
          if (first) first = false; else skipPunc(separator);
          if (isPunc(stop)) break;
          a.push(parser());
      }
      skipPunc(stop);
      return a;
  }
  function parseCall(func) {
      return {
          type: "call",
          func: func,
          args: delimited("(", ")", ",", parseExpression),
      };
  }
  function parseVarname() {
      var name = input.next();
      if (name.type != "var") input.croak("Expecting variable name");
      return name.value;
  }
  function parseVardef() {
      var name = parseVarname(), def;
      if (isOp("=")) {
          input.next();
          def = parseExpression();
      }
      return { name: name, def: def };
  }
  function parseLet() {
      skipKw("let");
      if (input.peek().type == "var") {
          var name = input.next().value;
          var defs = delimited("(", ")", ",", parseVardef);
          return {
              type: "call",
              func: {
                  type: "lambda",
                  name: name,
                  vars: defs.map(function(def){ return def.name }),
                  body: parseExpression(),
              },
              args: defs.map(function(def){ return def.def || FALSE })
          };
      }
      return {
          type: "let",
          vars: delimited("(", ")", ",", parseVardef),
          body: parseExpression(),
      };
  }
  function parseIf() {
      skipKw("if");
      var cond = parseExpression();
      if (!isPunc("{")) skipKw("then");
      var then = parseExpression();
      var ret: {[key: string]: string} = {
          type: "if",
          cond: cond,
          then: then,
      };
      if (isKw("else")) {
          input.next();
          ret.else = parseExpression();
      }
      return ret;
  }
  function parseLambda() {
      return {
          type: "lambda",
          name: input.peek().type == "var" ? input.next().value : null,
          vars: delimited("(", ")", ",", parseVarname),
          body: parseExpression()
      };
  }
  function parseBool() {
      return {
          type  : "bool",
          value : input.next().value == "true"
      };
  }
  function parseRaw() {
      skipKw("js:raw");
      if (input.peek().type != "str")
          input.croak("js:raw must be a plain string");
      return {
          type : "raw",
          code : input.next().value
      };
  }
  function maybeCall(expr) {
      expr = expr();
      return isPunc("(") ? parseCall(expr) : expr;
  }
  function parseAtom() {
      return maybeCall(function(){
          if (isPunc("(")) {
              input.next();
              var exp = parseExpression();
              skipPunc(")");
              return exp;
          }
          if (isPunc("{")) return parseProg();
          if (isOp("!")) {
              input.next();
              return {
                  type: "not",
                  body: parseAtom()
              };
          }
          if (isKw("let")) return parseLet();
          if (isKw("if")) return parseIf();
          if (isKw("true") || isKw("false")) return parseBool();
          if (isKw("js:raw")) return parseRaw();
          if (isKw("lambda") || isKw("位")) {
              input.next();
              return parseLambda();
          }
          var tok = input.next();
          if (tok.type == "var" || tok.type == "num" || tok.type == "str")
              return tok;
          unexpected();
      });
  }
  function parseToplevel() {
      var prog = [];
      while (!input.eof()) {
          prog.push(parseExpression());
          if (!input.eof()) skipPunc(";");
      }
      return { type: "prog", prog: prog };
  }
  function parseProg() {
      var prog = delimited("{", "}", ";", parseExpression);
      if (prog.length == 0) return FALSE;
      if (prog.length == 1) return prog[0];
      return { type: "prog", prog: prog };
  }
  function parseExpression() {
      return maybeCall(function(){
          return maybeBinary(parseAtom(), 0);
      });
  }
}


export function InputStream(input:string) {
  let pos = 0;
  let line  = 1;
  let col = 0;
  const next = () => {
    var ch = input.charAt(pos++);
    if (ch == "\n") line++, col = 0; else col++;
    return ch;
  }
  const peek = () => {
    return input.charAt(pos);
  }


  const eof = () => {
    return peek() == "";
  }
  const croak = (msg): string => {
      throw new Error(msg + " (" + line + ":" + col + ")");
  }

  return {
      next  : next,
      peek  : peek,
      eof   : eof,
      croak : croak,
  }

}

export function TokenStream(input:any) {
  let current = null;
  let keywords = " let if then else lambda 位 true false js:raw ";
  return {
      next  : next,
      peek  : peek,
      eof   : eof,
      croak : input.croak
  };
  function isKeyword(x) {
      return keywords.indexOf(" " + x + " ") >= 0;
  }
  function isDigit(ch) {
      return /[0-9]/i.test(ch);
  }
  function isIdStart(ch) {
      return /[a-z位_]/i.test(ch);
  }
  function isId(ch) {
      return isIdStart(ch) || "?!-<:>=0123456789".indexOf(ch) >= 0;
  }
  function isOpChar(ch) {
      return "+-*/%=&|<>!".indexOf(ch) >= 0;
  }
  function isPunc(ch) {
      return ",;(){}[]:".indexOf(ch) >= 0;
  }
  function isWhitespace(ch) {
      return " \t\n".indexOf(ch) >= 0;
  }
  function readWhile(predicate) {
      var str = "";
      while (!input.eof() && predicate(input.peek()))
          str += input.next();
      return str;
  }
  function readNumber() {
      var has_dot = false;
      var number = readWhile(function(ch){
          if (ch == ".") {
              if (has_dot) return false;
              has_dot = true;
              return true;
          }
          return isDigit(ch);
      });
      return { type: "num", value: parseFloat(number) };
  }
  function readIdent() {
      var id = readWhile(isId);
      return {
          type  : isKeyword(id) ? "kw" : "var",
          value : id
      };
  }
  function readEscaped(end) {
      var escaped = false, str = "";
      input.next();
      while (!input.eof()) {
          var ch = input.next();
          if (escaped) {
              str += ch;
              escaped = false;
          } else if (ch == "\\") {
              escaped = true;
          } else if (ch == end) {
              break;
          } else {
              str += ch;
          }
      }
      return str;
  }
  function readString() {
      return { type: "str", value: readEscaped('"') };
  }
  function skipComment() {
      readWhile(function(ch){ return ch != "\n" });
      input.next();
  }
  function readNext() {
      readWhile(isWhitespace);
      if (input.eof()) return null;
      var ch = input.peek();
      if (ch == "#") {
          skipComment();
          return readNext();
      }
      if (ch == '"') return readString();
      if (isDigit(ch)) return readNumber();
      if (isIdStart(ch)) return readIdent();
      if (isPunc(ch)) return {
          type  : "punc",
          value : input.next()
      };
      if (isOpChar(ch)) return {
          type  : "op",
          value : readWhile(isOpChar)
      };
      input.croak("Can't handle character: " + ch);
  }
  function peek() {
      return current || (current = readNext());
  }
  function next() {
      var tok = current;
      current = null;
      return tok || readNext();
  }
  function eof() {
      return peek() == null;
  }
}
