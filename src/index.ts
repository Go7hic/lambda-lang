"use strict";

import { makeJS } from './lib/generator';
import { optimize } from './lib/optimizer';
import { parse, InputStream, TokenStream }from './lib/parser'
import { toCps } from './lib/transformer';

export {
  makeJS,
  optimize,
  parse,
  InputStream,
  TokenStream,
  toCps
}
