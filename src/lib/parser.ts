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
  return parse_toplevel();

  function is_punc(ch) {
      var tok = input.peek();
      return tok && tok.type == "punc" && (!ch || tok.value == ch) && tok;
  }
  function is_kw(kw) {
      var tok = input.peek();
      return tok && tok.type == "kw" && (!kw || tok.value == kw) && tok;
  }
  function is_op(op?:any) {
      var tok = input.peek();
      return tok && tok.type == "op" && (!op || tok.value == op) && tok;
  }
  function skip_punc(ch) {
      if (is_punc(ch)) input.next();
      else input.croak("Expecting punctuation: \"" + ch + "\"");
  }
  function skip_kw(kw) {
      if (is_kw(kw)) input.next();
      else input.croak("Expecting keyword: \"" + kw + "\"");
  }
  // function skip_op(op) {
  //     if (is_op(op)) input.next();
  //     else input.croak("Expecting operator: \"" + op + "\"");
  // }
  function unexpected() {
      input.croak("Unexpected token: " + JSON.stringify(input.peek()));
  }
  function maybe_binary(left, my_prec) {
      var tok = is_op();
      if (tok) {
          var his_prec = PRECEDENCE[tok.value];
          if (his_prec > my_prec) {
              input.next();
              return maybe_binary({
                  type     : tok.value == "=" ? "assign" : "binary",
                  operator : tok.value,
                  left     : left,
                  right    : maybe_binary(parse_atom(), his_prec)
              }, my_prec);
          }
      }
      return left;
  }
  function delimited(start, stop, separator, parser) {
      var a = [], first = true;
      skip_punc(start);
      while (!input.eof()) {
          if (is_punc(stop)) break;
          if (first) first = false; else skip_punc(separator);
          if (is_punc(stop)) break;
          a.push(parser());
      }
      skip_punc(stop);
      return a;
  }
  function parse_call(func) {
      return {
          type: "call",
          func: func,
          args: delimited("(", ")", ",", parse_expression),
      };
  }
  function parse_varname() {
      var name = input.next();
      if (name.type != "var") input.croak("Expecting variable name");
      return name.value;
  }
  function parse_vardef() {
      var name = parse_varname(), def;
      if (is_op("=")) {
          input.next();
          def = parse_expression();
      }
      return { name: name, def: def };
  }
  function parse_let() {
      skip_kw("let");
      if (input.peek().type == "var") {
          var name = input.next().value;
          var defs = delimited("(", ")", ",", parse_vardef);
          return {
              type: "call",
              func: {
                  type: "lambda",
                  name: name,
                  vars: defs.map(function(def){ return def.name }),
                  body: parse_expression(),
              },
              args: defs.map(function(def){ return def.def || FALSE })
          };
      }
      return {
          type: "let",
          vars: delimited("(", ")", ",", parse_vardef),
          body: parse_expression(),
      };
  }
  function parse_if() {
      skip_kw("if");
      var cond = parse_expression();
      if (!is_punc("{")) skip_kw("then");
      var then = parse_expression();
      var ret: {[key: string]: string} = {
          type: "if",
          cond: cond,
          then: then,
      };
      if (is_kw("else")) {
          input.next();
          ret.else = parse_expression();
      }
      return ret;
  }
  function parse_lambda() {
      return {
          type: "lambda",
          name: input.peek().type == "var" ? input.next().value : null,
          vars: delimited("(", ")", ",", parse_varname),
          body: parse_expression()
      };
  }
  function parse_bool() {
      return {
          type  : "bool",
          value : input.next().value == "true"
      };
  }
  function parse_raw() {
      skip_kw("js:raw");
      if (input.peek().type != "str")
          input.croak("js:raw must be a plain string");
      return {
          type : "raw",
          code : input.next().value
      };
  }
  function maybe_call(expr) {
      expr = expr();
      return is_punc("(") ? parse_call(expr) : expr;
  }
  function parse_atom() {
      return maybe_call(function(){
          if (is_punc("(")) {
              input.next();
              var exp = parse_expression();
              skip_punc(")");
              return exp;
          }
          if (is_punc("{")) return parse_prog();
          if (is_op("!")) {
              input.next();
              return {
                  type: "not",
                  body: parse_atom()
              };
          }
          if (is_kw("let")) return parse_let();
          if (is_kw("if")) return parse_if();
          if (is_kw("true") || is_kw("false")) return parse_bool();
          if (is_kw("js:raw")) return parse_raw();
          if (is_kw("lambda") || is_kw("位")) {
              input.next();
              return parse_lambda();
          }
          var tok = input.next();
          if (tok.type == "var" || tok.type == "num" || tok.type == "str")
              return tok;
          unexpected();
      });
  }
  function parse_toplevel() {
      var prog = [];
      while (!input.eof()) {
          prog.push(parse_expression());
          if (!input.eof()) skip_punc(";");
      }
      return { type: "prog", prog: prog };
  }
  function parse_prog() {
      var prog = delimited("{", "}", ";", parse_expression);
      if (prog.length == 0) return FALSE;
      if (prog.length == 1) return prog[0];
      return { type: "prog", prog: prog };
  }
  function parse_expression() {
      return maybe_call(function(){
          return maybe_binary(parse_atom(), 0);
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
  function is_keyword(x) {
      return keywords.indexOf(" " + x + " ") >= 0;
  }
  function is_digit(ch) {
      return /[0-9]/i.test(ch);
  }
  function is_id_start(ch) {
      return /[a-z位_]/i.test(ch);
  }
  function is_id(ch) {
      return is_id_start(ch) || "?!-<:>=0123456789".indexOf(ch) >= 0;
  }
  function is_op_char(ch) {
      return "+-*/%=&|<>!".indexOf(ch) >= 0;
  }
  function is_punc(ch) {
      return ",;(){}[]:".indexOf(ch) >= 0;
  }
  function is_whitespace(ch) {
      return " \t\n".indexOf(ch) >= 0;
  }
  function read_while(predicate) {
      var str = "";
      while (!input.eof() && predicate(input.peek()))
          str += input.next();
      return str;
  }
  function read_number() {
      var has_dot = false;
      var number = read_while(function(ch){
          if (ch == ".") {
              if (has_dot) return false;
              has_dot = true;
              return true;
          }
          return is_digit(ch);
      });
      return { type: "num", value: parseFloat(number) };
  }
  function read_ident() {
      var id = read_while(is_id);
      return {
          type  : is_keyword(id) ? "kw" : "var",
          value : id
      };
  }
  function read_escaped(end) {
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
  function read_string() {
      return { type: "str", value: read_escaped('"') };
  }
  function skip_comment() {
      read_while(function(ch){ return ch != "\n" });
      input.next();
  }
  function read_next() {
      read_while(is_whitespace);
      if (input.eof()) return null;
      var ch = input.peek();
      if (ch == "#") {
          skip_comment();
          return read_next();
      }
      if (ch == '"') return read_string();
      if (is_digit(ch)) return read_number();
      if (is_id_start(ch)) return read_ident();
      if (is_punc(ch)) return {
          type  : "punc",
          value : input.next()
      };
      if (is_op_char(ch)) return {
          type  : "op",
          value : read_while(is_op_char)
      };
      input.croak("Can't handle character: " + ch);
  }
  function peek() {
      return current || (current = read_next());
  }
  function next() {
      var tok = current;
      current = null;
      return tok || read_next();
  }
  function eof() {
      return peek() == null;
  }
}
