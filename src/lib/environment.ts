export function Environment(parent?:any) {
  this.vars = Object.create(parent ? parent.vars : null);
  this.parent = parent;
}

Environment.prototype = {
  extend: function() {
      return new Environment(this);
  },
  lookup: function(name: any) {
      var scope = this;
      while (scope) {
          if (Object.prototype.hasOwnProperty.call(scope.vars, name))
              return scope;
          scope = scope.parent;
      }
  },
  get: function(name: string) {
      if (name in this.vars)
          return this.vars[name];
      throw new Error("Undefined variable " + name);
  },
  set: function(name: string, value: any) {
      var scope = this.lookup(name);
      if (!scope && this.parent)
          throw new Error("Undefined variable " + name);
      return (scope || this).vars[name] = value;
  },
  def: function(name: string | number, value: any) {
      return this.vars[name] = value;
  },
};
