
import { FALSE, TRUE } from './const'
import { Environment } from './environment'
import { gensym, hasSideEffects } from './transformer';

export function makeScope(exp) {
  var global = new Environment();
  exp.env = global;
  (function scope(exp, env) {
      switch (exp.type) {
        case "num":
        case "str":
        case "bool":
        case "raw":
          break;

        case "var":
          var s = env.lookup(exp.value);
          if (!s) {
              exp.env = global;
              global.def(exp.value, { refs: [], assigned: 0 });
          } else {
              exp.env = s;
          }
          var def = exp.env.get(exp.value);
          def.refs.push(exp);
          exp.def = def;
          break;

        case "not":
          scope(exp.body, env);
          break;

        case "assign":
          scope(exp.left, env);
          scope(exp.right, env);
          if (exp.left.type == "var")
              exp.left.def.assigned++;
          break;

        case "binary":
          scope(exp.left, env);
          scope(exp.right, env);
          break;

        case "if":
          scope(exp.cond, env);
          scope(exp.then, env);
          if (exp.else)
              scope(exp.else, env);
          break;

        case "prog":
          exp.prog.forEach(function(exp){
              scope(exp, env);
          });
          break;

        case "call":
          scope(exp.func, env);
          exp.args.forEach(function(exp){
              scope(exp, env);
          });
          break;

        case "lambda":
          exp.env = env = env.extend();
          if (exp.name)
              env.def(exp.name, { refs: [], func: true, assigned: 0 });
          exp.vars.forEach(function(name, i){
              env.def(name, { refs: [], farg: true, assigned: 0, cont: i == 0 });
          });
          if (!exp.locs) exp.locs = [];
          exp.locs.forEach(function(name){
              env.def(name, { refs: [], floc: true, assigned: 0 });
          });
          scope(exp.body, env);
          break;

        default:
          throw new Error("Can't handle node " + JSON.stringify(exp));
      }
  })(exp, global);
  return exp.env;
}

export function optimize(exp) {
  var changes, defun;
  do {
      changes = 0;
      makeScope(exp);
      exp = opt(exp);
  } while (changes);

  makeScope(exp);
  return exp;

  function opt(exp) {
      if (changes) return exp;
      switch (exp.type) {
        case "raw"    :
        case "num"    :
        case "str"    :
        case "bool"   :
        case "var"    : return exp;
        case "not"    : return opt_not    (exp);
        case "binary" : return opt_binary (exp);
        case "assign" : return opt_assign (exp);
        case "if"     : return opt_if     (exp);
        case "prog"   : return opt_prog   (exp);
        case "call"   : return opt_call   (exp);
        case "lambda" : return opt_lambda (exp);
      }
      throw new Error("I don't know how to optimize " + JSON.stringify(exp));
  }

  function changed() {
      ++changes;
  }

  function is_constant(exp) {
      return exp.type == "num"
          || exp.type == "str"
          || exp.type == "bool";
  }

  function num(exp) {
      if (exp.type != "num")
          throw new Error("Not a number: " + JSON.stringify(exp));
      return exp.value;
  }

  function div(exp) {
      if (num(exp) == 0)
          throw new Error("Division by zero: " + JSON.stringify(exp));
      return exp.value;
  }

  function opt_not(exp) {
      exp.body = opt(exp.body);
      return exp;
  }

  function opt_binary(exp) {
      exp.left = opt(exp.left);
      exp.right = opt(exp.right);
      if (is_constant(exp.left) && is_constant(exp.right)) {
          switch (exp.operator) {
            case "+":
              changed();
              return {
                  type: "num",
                  value: num(exp.left) + num(exp.right)
              };

            case "-":
              changed();
              return {
                  type: "num",
                  value: num(exp.left) - num(exp.right)
              };

            case "*":
              changed();
              return {
                  type: "num",
                  value: num(exp.left) * num(exp.right)
              };

            case "/":
              changed();
              return {
                  type: "num",
                  value: num(exp.left) / div(exp.right)
              };

            case "%":
              changed();
              return {
                  type: "num",
                  value: num(exp.left) % div(exp.right)
              };

            case "<":
              changed();
              return {
                  type: "bool",
                  value: num(exp.left) < num(exp.right)
              };

            case ">":
              changed();
              return {
                  type: "bool",
                  value: num(exp.left) > num(exp.right)
              };

            case "<=":
              changed();
              return {
                  type: "bool",
                  value: num(exp.left) <= num(exp.right)
              };

            case ">=":
              changed();
              return {
                  type: "bool",
                  value: num(exp.left) >= num(exp.right)
              };

            case "==":
              changed();
              if (exp.left.type != exp.right.type)
                  return FALSE;
              return {
                  type: "bool",
                  value: exp.left.value === exp.right.value
              };

            case "!=":
              changed();
              if (exp.left.type != exp.right.type)
                  return TRUE;
              return {
                  type: "bool",
                  value: exp.left.value !== exp.right.value
              };

            case "||":
              changed();
              if (exp.left.value !== false)
                  return exp.left;
              return exp.right;

            case "&&":
              changed();
              if (exp.left.value !== false)
                  return exp.right;
              return FALSE;
          }
      }
      return exp;
  }

  function opt_assign(exp) {
      if (exp.left.type == "var") {
          if (exp.right.type == "var" && exp.right.def.cont) {
              // the var on the right never changes.  we can safely
              // replace references to exp.left with references to
              // exp.right, saving one var and the assignment.
              changed();
              exp.left.def.refs.forEach(function(node){
                  node.value = exp.right.value;
              });
              return opt(exp.right); // could be needed for the result.
          }
          if (exp.left.def.refs.length == exp.left.def.assigned && exp.left.env.parent) {
              // if assigned as many times as referenced and not a
              // global, it means the var is never used, drop the
              // assignment but keep the right side for possible
              // side effects.
              changed();
              return opt(exp.right);
          }
      }
      exp.left = opt(exp.left);
      exp.right = opt(exp.right);
      return exp;
  }

  function opt_if(exp) {
      exp.cond = opt(exp.cond);
      exp.then = opt(exp.then);
      exp.else = opt(exp.else || FALSE);
      if (is_constant(exp.cond)) {
          changed();
          if (exp.cond.value !== false)
              return exp.then;
          return exp.else;
      }
      return exp;
  }

  function opt_prog(exp) {
      if (exp.prog.length == 0) {
          changed();
          return FALSE;
      }
      if (exp.prog.length == 1) {
          changed();
          return opt(exp.prog[0]);
      }
      if (!hasSideEffects(exp.prog[0])) {
          changed();
          return opt({
              type : "prog",
              prog : exp.prog.slice(1)
          });
      }
      if (exp.prog.length == 2) return {
          type: "prog",
          prog: exp.prog.map(opt)
      };
      // normalize
      return opt({
          type: "prog",
          prog: [
              exp.prog[0],
              { type: "prog", prog: exp.prog.slice(1) }
          ]
      });
  }

  function opt_call(exp) {
      // IIFE-s will be optimized away by defining variables in the
      // containing function.  However, we don't unwrap into the
      // global scope (that's why checking for env.parent.parent).
      var func = exp.func;
      if (func.type == "lambda" && !func.name) {
          if (func.env.parent.parent)
              return opt_iife(exp);
          // however, if in global scope we can safely unguard it.
          func.unguarded = true;
      }
      return {
          type : "call",
          func : opt(func),
          args : exp.args.map(opt)
      };
  }

  function opt_lambda(f) {
      // 位(x...) y(x...)  ==>  y
      TCO: if (f.body.type == "call" &&
               f.body.func.type == "var" &&
               f.body.func.def.assigned == 0 &&
               f.body.func.env.parent &&
               f.vars.indexOf(f.body.func.value) < 0 &&
               f.vars.length == f.body.args.length) {
          for (var i = 0; i < f.vars.length; ++i) {
              var x = f.body.args[i];
              if (x.type != "var" || x.value != f.vars[i])
                  break TCO;
          }
          changed();
          return opt(f.body.func);
      }
      f.locs = f.locs.filter(function(name){
          var def = f.env.get(name);
          return def.refs.length > 0;
      });
      var save = defun;
      defun = f;
      f.body = opt(f.body);
      if (f.body.type == "call")
          f.unguarded = true;
      defun = save;
      return f;
  }

  // (位(foo, bar){...body...})(fooval, barval)
  //    ==>
  // foo = fooval, bar = barval, ...body...
  function opt_iife(exp) {
      changed();
      var func = exp.func;
      var argvalues = exp.args.map(opt);
      var body = opt(func.body);
      function rename(name) {
          var sym = name in defun.env.vars ? gensym(name + "$") : name;
          defun.locs.push(sym);
          defun.env.def(sym, true);
          func.env.get(name).refs.forEach(function(ref){
              ref.value = sym;
          });
          return sym;
      }
      var prog = func.vars.map(function(name, i){
          return {
              type     : "assign",
              operator : "=",
              left     : { type: "var", value: rename(name) },
              right    : argvalues[i] || FALSE
          };
      });
      func.locs.forEach(rename);
      prog.push(body);
      return opt({
          type: "prog",
          prog: prog
      });
  }
}
