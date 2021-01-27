import { FALSE } from './const'
let GENSYM = 0;

export function gensym(name: string | number) {
    if (!name) name = "";
    name = "尾_" + name;
    return name + (++GENSYM);
}

export function hasSideEffects(exp: { type: any; left: any; right: any; cond: any; then: any; else: any; vars: string | any[]; body: any; prog: string | any[]; }) {
    switch (exp.type) {
      case "call":
      case "assign":
      case "raw":
        return true;

      case "num":
      case "str":
      case "bool":
      case "var":
      case "lambda":
        return false;

      case "binary":
        return hasSideEffects(exp.left)
            || hasSideEffects(exp.right);

      case "if":
        return hasSideEffects(exp.cond)
            || hasSideEffects(exp.then)
            || (exp.else && hasSideEffects(exp.else));

      case "let":
        for (var i = 0; i < exp.vars.length; ++i) {
            var v = exp.vars[i];
            if (v.def && hasSideEffects(v.def))
                return true;
        }
        return hasSideEffects(exp.body);

      case "prog":
        for (var i = 0; i < exp.prog.length; ++i)
            if (hasSideEffects(exp.prog[i]))
                return true;
        return false;
    }
    return true;
}

export function toCps(exp: { type: string; prog: any[]; }, k: (x: any) => { type: string; func: { type: string; value: string; }; args: any[]; }) {
    return cps(exp, k);

    function cps(exp, k) {
        switch (exp.type) {
          case "raw"    :
          case "num"    :
          case "str"    :
          case "bool"   : return cpsAtom   (exp, k);

          case "assign" :
          case "binary" : return cpsBinary (exp, k);

          case "not"    : return cpsNot    (exp, k);
          case "var"    : return cpsVar    (exp, k);
          case "let"    : return cpsLet    (exp, k);
          case "lambda" : return cpsLambda (exp, k);
          case "if"     : return cpsIf     (exp, k);
          case "prog"   : return cpsProg   (exp, k);
          case "call"   : return cpsCall   (exp, k);
          default:
            throw new Error("Dunno how to CPS " + JSON.stringify(exp));
        }
    }
    function cpsAtom(exp, k) {
        return k(exp);
    }
    function cpsNot(exp, k) {
        return cps(exp.body, function(body){
            return k({ type: "not", body: body });
        });
    }
    function cpsVar(exp, k) {
        return k(exp);
    }
    function cpsBinary(exp, k) {
        return cps(exp.left, function(left){
            return cps(exp.right, function(right){
                return k({ type     : exp.type,
                           operator : exp.operator,
                           left     : left,
                           right    : right });
            });
        });
    }
    function cpsLet(exp, k) {
        if (exp.vars.length == 0)
            return cps(exp.body, k);
        return cps({
            type: "call",
            args: [ exp.vars[0].def || FALSE ],
            func: {
                type: "lambda",
                vars: [ exp.vars[0].name ],
                body: {
                    type: "let",
                    vars: exp.vars.slice(1),
                    body: exp.body
                }
            }
        }, k);
    }
    function cpsLambda(exp, k) {
        var cont = gensym("K");
        var body = cps(exp.body, function(body){
            return { type: "call",
                     func: { type: "var", value: cont },
                     args: [ body ] };
        });
        return k({ type: "lambda",
                   name: exp.name,
                   vars: [ cont ].concat(exp.vars),
                   body: body });
    }
    function cpsIf(exp, k) {
        return cps(exp.cond, function(cond){
            var cvar = gensym("I");
            var cast = makeContinuation(k);
            k = function(ifresult) {
                return {
                    type: "call",
                    func: { type: "var", value: cvar },
                    args: [ ifresult ]
                };
            };
            return {
                type: "call",
                func: {
                    type: "lambda",
                    vars: [ cvar ],
                    body: {
                        type: "if",
                        cond: cond,
                        then: cps(exp.then, k),
                        else: cps(exp.else || FALSE, k)
                    }
                },
                args: [ cast ]
            };
        });
    }
    function cpsCall(exp, k) {
        return cps(exp.func, function(func){
            return (function loop(args, i){
                if (i == exp.args.length) return {
                    type : "call",
                    func : func,
                    args : args
                };
                return cps(exp.args[i], function(value){
                    args[i + 1] = value;
                    return loop(args, i + 1);
                });
            })([ makeContinuation(k) ], 0);
        });
    }
    function makeContinuation(k) {
        var cont = gensym("R");
        return { type : "lambda",
                 vars : [ cont ],
                 body : k({ type  : "var",
                            value : cont }) };
    }
    function cpsProg(exp, k) {
        return (function loop(body){
            if (body.length == 0) return k(FALSE);
            if (body.length == 1) return cps(body[0], k);
            if (!hasSideEffects(body[0]))
                return loop(body.slice(1));
            return cps(body[0], function(first){
                if (hasSideEffects(first)) return {
                    type: "prog",
                    prog: [ first, loop(body.slice(1)) ]
                };
                return loop(body.slice(1));
            });
        })(exp.prog);
    }
}
