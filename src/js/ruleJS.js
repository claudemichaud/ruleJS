var ruleJS = (function (root) {
  'use strict';

  /**
   * object instance
   */
  var instance = this;

  /**
   * root element
   */
  var rootElement = document.getElementById(root) || null;

  /**
   * current version
   * @type {string}
   */
  var version = '0.0.1';

  /**
   * formulas delivered by formulaJS library
   * contains most of Microsoft Excel formula functions
   * @type {Window.Formula|*|{}}
   */
  var formulas = {};

  /**
   * parser object delivered by jison library
   * @type {Parser|*|{}}
   */
  var parser = {};

  var FormulaParser = function(handler) {
    var formulaLexer = function () {};
    formulaLexer.prototype = Parser.lexer;

    var formulaParser = function () {
      this.lexer = new formulaLexer();
      this.yy = {};
    };

    formulaParser.prototype = Parser;
    var newParser = new formulaParser;
    newParser.setObj = function(obj) {
      newParser.yy.obj = obj;
    };

    newParser.yy.parseError = function (str, hash) {
//      if (!((hash.expected && hash.expected.indexOf("';'") >= 0) &&
//        (hash.token === "}" || hash.token === "EOF" ||
//          parser.newLine || parser.wasNewLine)))
//      {
//        throw new SyntaxError(hash);
//      }
      throw {
        name: 'Parser error',
        message: str,
        prop: hash
      }
    };

    newParser.yy.handler = handler;

    return newParser;
  };

  /**
   * Exception object
   * @type {{errors: {type: string, output: string}[], get: get}}
   */
  var Exception = {
    /**
     * error types
     */
    errors: [
      {type: 'NULL', output: '#NULL'},
      {type: 'DIV_ZERO', output: '#DIV/0!'},
      {type: 'VALUE', output: '#VALUE!'},
      {type: 'REF', output: '#REF!'},
      {type: 'NAME', output: '#NAME?'},
      {type: 'NUM', output: '#NUM!'},
      {type: 'NOT_AVAILABLE', output: '#N/A'},
      {type: 'ERROR', output: '#ERROR'}
    ],
    /**
     * get error by type
     * @param {String} type
     * @returns {*}
     */
    get: function (type) {
      var error = Exception.errors.filter(function (item) {
        return item.type === type
      })[0];

      return error ? error.output : null;
    }
  };

  /**
   * matrix collection for each form, contains cache of all form element
   */
  var Matrix = function () {

    /**
     * single item (cell) object
     * @type {{id: string, formula: string, value: string, error: string, deps: Array, formulaEdit: boolean}}
     */
    var item = {
      id: '',
      formula: '',
      value: '',
      error: '',
      deps: [],
      formulaEdit: false
    };

    /**
     * array of items
     * @type {Array}
     */
    var data = [];

    /**
     * form elements, which can be parsed
     * @type {string[]}
     */
    var formElements = ['input[type=text]', '[data-formula]'];

    var listen = function () {
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
      else if (!document.activeElement) { //IE
        document.body.focus();
      }
    };

    /**
     * get item from data array
     * @param {String} id
     * @returns {*}
     */
    this.getItem = function (id) {
      return data.filter(function (item) {
        return item.id === id;
      })[0];
    };

    /**
     * remove item from data array
     * @param {String} id
     */
    this.removeItem = function (id) {
      data = data.filter(function (item) {
        return item.id !== id;
      });
    };

    /**
     * update item properties
     * @param {Object|String} item or id
     * @param {Object} props
     */
    this.updateItem = function (item, props) {
      if (instance.utils.isString(item)) {
        item = instance.matrix.getItem(item);
      }

      if (item && props) {
        for (var p in props) {
          if (item[p] && instance.utils.isArray(item[p])) {
            if (instance.utils.isArray(props[p])) {
              props[p].forEach(function (i) {
                if (item[p].indexOf(i) === -1) {
                  item[p].push(i);
                }
              });
            } else {

              if (item[p].indexOf(props[p]) === -1) {
                item[p].push(props[p]);
              }
            }
          } else {
            item[p] = props[p];
          }
        }
      }
    };

    /**
     * add item to data array
     * @param {Object} item
     */
    this.addItem = function (item) {
      var cellExist = data.filter(function (cell) {
        return cell.id === item.id
      })[0];

      if (!cellExist) {
        data.push(item);
      } else {
        instance.matrix.updateItem(cellExist, item);
      }

      return instance.matrix.getItem(item.id);
    };

    /**
     * update element item properties in data array
     * @param {Element} element
     * @param {Object} props
     */
    this.updateElementItem = function (element, props) {
      var id = element.getAttribute('id'),
        item = instance.matrix.getItem(id);

      instance.matrix.updateItem(item, props);
    };

    /**
     * get cell dependencies
     * @param {String} id
     * @returns {Array}
     */
    this.getDependencies = function (id) {
      /**
       * get dependencies by element
       * @param {String} id
       * @returns {Array}
       */
      var getDependencies = function (id) {
        var filtered = data.filter(function (cell) {
          if (cell.deps) {
            return cell.deps.indexOf(id) > -1;
          }
        });

        var deps = [];
        filtered.forEach(function (cell) {
          if (deps.indexOf(cell.id) === -1) {
            deps.push(cell.id);
          }
        });

        return deps;
      };

      var allDependencies = [];

      /**
       * get total dependencies
       * @param {String} id
       */
      var getTotalDependencies = function (id) {
        var deps = getDependencies(id);

        if (deps.length) {
          deps.forEach(function (refId) {
            if (allDependencies.indexOf(refId) === -1) {
              allDependencies.push(refId);

              var item = instance.matrix.getItem(refId);
              if (item.deps.length) {
                getTotalDependencies(refId);
              }
            }
          });
        }
      };

      getTotalDependencies(id);

      return allDependencies;
    };

    /**
     * get total element cell dependencies
     * @param {Element} element
     * @returns {Array}
     */
    this.getElementDependencies = function (element) {
      return instance.matrix.getDependencies(element.getAttribute('id'));
    };

    /**
     * recalculate refs cell
     * @param {Element} element
     */
    var recalculateElementDependencies = function (element) {
      var allDependencies = instance.matrix.getElementDependencies(element),
        id = element.getAttribute('id');

      allDependencies.forEach(function (refId) {
        var item = instance.matrix.getItem(refId);
        if (item && item.formula) {
          var refElement = document.getElementById(refId);
          calculateElementFormula(item.formula, refElement);
        }
      });
    };

    /**
     * calculate element formula
     * @param {String} formula
     * @param {Element} element
     * @returns {Object}
     */
    var calculateElementFormula = function (formula, element) {
      // to avoid double translate formulas, update item data in parser
      var parsed = parse(formula, element),
        value = parsed.result,
        error = parsed.error,
        nodeName = element.nodeName.toUpperCase();

      instance.matrix.updateElementItem(element, {value: value, error: error});

      if (['INPUT'].indexOf(nodeName) === -1) {
        element.innerText = value || error;
      }

      element.value = value || error;

      return parsed;
    };

    /**
     * register new found element to matrix
     * @param {Element} element
     * @returns {Object}
     */
    var registerElementInMatrix = function (element) {

      var id = element.getAttribute('id'),
        formula = element.getAttribute('data-formula');

      if (formula) {
        // add item with basic properties to data array
        instance.matrix.addItem({
          id: id,
          formula: formula
        });

        calculateElementFormula(formula, element);
      }

    };

    /**
     * register events for elements
     * @param element
     */
    var registerElementEvents = function (element) {
      var id = element.getAttribute('id');

      // on db click show formula
      element.addEventListener('dblclick', function () {
        var item = instance.matrix.getItem(id);

        if (item && item.formula) {
          item.formulaEdit = true;
          element.value = '=' + item.formula;
        }
      });

      element.addEventListener('blur', function () {
        var item = instance.matrix.getItem(id);

        if (item) {
          if (item.formulaEdit) {
            element.value = item.value || item.error;
          }

          item.formulaEdit = false;
        }
      });

      // if pressed ESC restore original value
      element.addEventListener('keyup', function (event) {
        switch (event.keyCode) {
          case 13: // ENTER
          case 27: // ESC
            // leave cell
            listen();
            break;
        }
      });

      // re-calculate formula if ref cells value changed
      element.addEventListener('change', function () {
        // reset and remove item
        instance.matrix.removeItem(id);

        // check if inserted text could be the formula
        var value = element.value;

        if (value[0] === '=') {
          element.setAttribute('data-formula', value.substr(1));
          registerElementInMatrix(element);
        }

        // get ref cells and re-calculate formulas
        recalculateElementDependencies(element);
      });
    };

    /**
     * scan the form and build the calculation matrix
     */
    this.scan = function () {
      var $totalElements = rootElement.querySelectorAll(formElements);

      // iterate through elements contains specified attributes
      [].slice.call($totalElements).forEach(function ($item) {
        registerElementInMatrix($item);
        registerElementEvents($item);
      });
    };
  };

  /**
   * utils methods
   * @type {{isArray: isArray, toNum: toNum, toChar: toChar, cellCoords: cellCoords}}
   */
  var utils = {
    /**
     * check if value is array
     * @param value
     * @returns {boolean}
     */
    isArray: function (value) {
      return Object.prototype.toString.call(value) === '[object Array]';
    },

    /**
     * check if value is number
     * @param value
     * @returns {boolean}
     */
    isNumber: function (value) {
      return Object.prototype.toString.call(value) === '[object Number]';
    },

    /**
     * check if value is string
     * @param value
     * @returns {boolean}
     */
    isString: function (value) {
      return Object.prototype.toString.call(value) === '[object String]';
    },

    /**
     * check if value is function
     * @param value
     * @returns {boolean}
     */
    isFunction: function (value) {
      return Object.prototype.toString.call(value) === '[object Function]';
    },

    /**
     * check if value is undefined
     * @param value
     * @returns {boolean}
     */
    isUndefined: function (value) {
      return Object.prototype.toString.call(value) === '[object Undefined]';
    },

    /**
     * check if value is cell
     * @param {String} value
     * @returns {Boolean}
     */
    isCell: function (value) {
      return value.match(/^[A-Za-z]+[0-9]+/) ? true : false;
    },

    /**
     * get row name and column number
     * @param cell
     * @returns {{alpha: string, num: number}}
     */
    getCellAlphaNum: function (cell) {
      var num = cell.match(/\d+$/),
        alpha = cell.replace(num, '');

      return {
        alpha: alpha,
        num: parseInt(num[0], 10)
      }
    },

    /**
     * change row cell index A1 -> A2
     * @param {String} cell
     * @param {Number} counter
     * @returns {String}
     */
    changeRowIndex: function (cell, counter) {
      var cellCoords = instance.utils.getCellAlphaNum(cell);
      return cellCoords.alpha + '' + parseInt(cellCoords.num + counter, 10);
    },

    /**
     * change col cell index A1 -> B1 Z1 -> AA1
     * @param {String} cell
     * @param {Number} counter
     * @returns {String}
     */
    changeColIndex: function (cell, counter) {
      var cellCoords = instance.utils.getCellAlphaNum(cell);
      return instance.utils.toChar(parseInt(instance.utils.toNum(cellCoords.alpha) + counter, 10)) + cellCoords.num;
    },

    /**
     * TODO: absolute cells
     * update formula cells
     * @param {String} formula
     * @param {String} direction
     * @param {Number} delta
     * @returns {String}
     */
    updateFormula: function (formula, direction, delta) {
      var type,
        counter;

      // left, right -> col
      if (['left', 'right'].indexOf(direction) !== -1) {
        type = 'col';
      } else if (['up', 'down'].indexOf(direction) !== -1) {
        type = 'row'
      }

      if (['down', 'right'].indexOf(direction) !== -1) {
        counter = delta * 1;
      } else if(['up', 'left'].indexOf(direction) !== -1) {
        counter = delta * (-1);
      }

      if (type && counter) {
        return formula.replace(/(\$?[A-Za-z]+\$?[0-9]+)/g, function (match, p1, p2, p3, p4) {
          debugger;
          return (type === 'row' ? instance.utils.changeRowIndex(match, counter) : instance.utils.changeColIndex(match, counter));
        });
      }

      return formula;
    },

    updateValue: function (value, direction, delta) {
      var counter;

      if (['down', 'right'].indexOf(direction) !== -1) {
        counter = delta * 1;
      } else if(['up', 'left'].indexOf(direction) !== -1) {
        counter = delta * (-1);
      }

      if (counter) {
        value += counter;
      }

      return value;
    },

    /**
     * convert string char to number e.g A => 0, Z => 25, AA => 27
     * @param {String} chr
     * @returns {Number}
     */
    toNum: function (chr) {
      chr = chr.split('');

      var base = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"],
        i, j, result = 0;

      for (i = 0, j = chr.length - 1; i < chr.length; i += 1, j -= 1) {
        result += Math.pow(base.length, j) * (base.indexOf(chr[i]));
      }

      return result;
    },

    /**
     * convert number to string char, e.g 0 => A, 25 => Z, 26 => AA
     * @param {Number} num
     * @returns {String}
     */
    toChar: function (num) {
      var s = '';

      while (num >= 0) {
        s = String.fromCharCode(num % 26 + 97) + s;
        num = Math.floor(num / 26) - 1;
      }

      return s.toUpperCase();
    },

    /**
     * get cell coordinates
     * @param {String} cell A1
     * @returns {{row: Number, col: number}}
     */
    cellCoords: function (cell) {
      var num = cell.match(/\d+$/),
        alpha = cell.replace(num, '');

      return {
        row: parseInt(num[0], 10) - 1,
        col: instance.utils.toNum(alpha)
      };
    },

    /**
     * translate cell coordinates to merged form {row:0, col:0} -> A1
     * @param coords
     * @returns {string}
     */
    translateCellCoords: function (coords) {
      return instance.utils.toChar(coords.col) + '' + parseInt(coords.row + 1, 10);
    },

    /**
     * iterate cell range and get theirs indexes and values
     * @param {Object} startCell ex.: {row:1, col: 1}
     * @param {Object} endCell ex.: {row:10, col: 1}
     * @param {Function=} callback
     * @returns {{index: Array, value: Array}}
     */
    iterateCells: function (startCell, endCell, callback) {
      var result = {
        index: [], // list of cell index: A1, A2, A3
        value: []  // list of cell value
      };

      var cols = {
        start: 0,
        end: 0
      };

      if (endCell.col >= startCell.col) {
        cols = {
          start: startCell.col,
          end: endCell.col
        };
      } else {
        cols = {
          start: endCell.col,
          end: startCell.col
        };
      }

      var rows = {
        start: 0,
        end: 0
      };

      if (endCell.row >= startCell.row) {
        rows = {
          start: startCell.row,
          end: endCell.row
        };
      } else {
        rows = {
          start: endCell.row,
          end: startCell.row
        };
      }

      for (var column = cols.start; column <= cols.end; column++) {
        for (var row = rows.start; row <= rows.end; row++) {
          var cellIndex = instance.utils.toChar(column) + (row + 1),
              cellValue = instance.helper.cellValue.call(this, cellIndex);

          result.index.push(cellIndex);
          result.value.push(cellValue);
        }
      }

      if (instance.utils.isFunction(callback)) {
        return callback.apply(callback, [result]);
      } else {
        return result;
      }
    }
  };

  /**
   * helper with methods using by parser
   * @type {{number: number, numberInverted: numberInverted, mathMatch: mathMatch, callFunction: callFunction}}
   */
  var helper = {
    /**
     * list of supported formulas
     */
    SUPPORTED_FORMULAS: [
      'ABS', 'ACCRINT', 'ACOS', 'ACOSH', 'ACOTH', 'AND', 'ARABIC', 'ASIN', 'ASINH', 'ATAN', 'ATAN2', 'ATANH', 'AVEDEV', 'AVERAGE', 'AVERAGEA', 'AVERAGEIF',
      'BASE', 'BESSELI', 'BESSELJ', 'BESSELK', 'BESSELY', 'BETADIST', 'BETAINV', 'BIN2DEC', 'BIN2HEX', 'BIN2OCT', 'BINOMDIST', 'BINOMDISTRANGE', 'BINOMINV', 'BITAND', 'BITLSHIFT', 'BITOR', 'BITRSHIFT', 'BITXOR',
      'CEILING', 'CEILINGMATH', 'CEILINGPRECISE', 'CHAR', 'CHISQDIST', 'CHISQINV', 'CODE', 'COMBIN', 'COMBINA', 'COMPLEX', 'CONCATENATE', 'CONFIDENCENORM', 'CONFIDENCET', 'CONVERT', 'CORREL', 'COS', 'COSH', 'COT', 'COTH', 'COUNT', 'COUNTA', 'COUNTBLANK', 'COUNTIF', 'COUNTIFS', 'COUNTIN', 'COUNTUNIQUE', 'COVARIANCEP', 'COVARIANCES', 'CSC', 'CSCH', 'CUMIPMT', 'CUMPRINC',
      'DATE', 'DATEVALUE', 'DAY', 'DAYS', 'DAYS360', 'DB', 'DDB', 'DEC2BIN', 'DEC2HEX', 'DEC2OCT', 'DECIMAL', 'DEGREES', 'DELTA', 'DEVSQ', 'DOLLAR', 'DOLLARDE', 'DOLLARFR',
      'E', 'EDATE', 'EFFECT', 'EOMONTH', 'ERF', 'ERFC', 'EVEN', 'EXACT', 'EXPONDIST',
      'FALSE', 'FDIST', 'FINV', 'FISHER', 'FISHERINV',
      'IF', 'INT', 'ISEVEN', 'ISODD',
      'LN', 'LOG', 'LOG10',
      'MAX', 'MAXA', 'MEDIAN', 'MIN', 'MINA', 'MOD',
      'NOT',
      'ODD', 'OR',
      'PI', 'POWER',
      'ROUND', 'ROUNDDOWN', 'ROUNDUP',
      'SIN', 'SINH', 'SPLIT', 'SQRT', 'SQRTPI', 'SUM', 'SUMIF', 'SUMIFS', 'SUMPRODUCT', 'SUMSQ', 'SUMX2MY2', 'SUMX2PY2', 'SUMXMY2',
      'TAN', 'TANH', 'TRUE', 'TRUNC',
      'XOR'
    ],

    /**
     * get number
     * @param  {Number|String} num
     * @returns {Number}
     */
    number: function (num) {
      switch (typeof num) {
        case 'number':
          return num;
        case 'string':
          if (!isNaN(num)) {
            return num.indexOf('.') > -1 ? parseFloat(num) : parseInt(num, 10);
          }
      }

      return num;
    },

    /**
     * get string
     * @param {Number|String} str
     * @returns {string}
     */
    string: function (str) {
      return str.substring(1, str.length - 1);
    },

    /**
     * invert number
     * @param num
     * @returns {Number}
     */
    numberInverted: function (num) {
      return this.number(num) * (-1);
    },

    /**
     * match special operation
     * @param {String} type
     * @param {String} exp1
     * @param {String} exp2
     * @returns {*}
     */
    specialMatch: function (type, exp1, exp2) {
      var result;

      switch (type) {
        case '&':
          result = exp1.toString() + exp2.toString();
          break;
      }
      return result;
    },

    /**
     * match logic operation
     * @param {String} type
     * @param {String|Number} exp1
     * @param {String|Number} exp2
     * @returns {Boolean} result
     */
    logicMatch: function (type, exp1, exp2) {
      var result;

      switch (type) {
        case '=':
          result = (exp1 === exp2);
          break;

        case '>':
          result = (exp1 > exp2);
          break;

        case '<':
          result = (exp1 < exp2);
          break;

        case '>=':
          result = (exp1 >= exp2);
          break;

        case '<=':
          result = (exp1 === exp2);
          break;

        case '<>':
          result = (exp1 != exp2);
          break;

        case 'NOT':
          result = (exp1 != exp2);
          break;
      }

      return result;
    },

    /**
     * match math operation
     * @param {String} type
     * @param {Number} number1
     * @param {Number} number2
     * @returns {*}
     */
    mathMatch: function (type, number1, number2) {
      var result;

      number1 = helper.number(number1);
      number2 = helper.number(number2);

      if (isNaN(number1) || isNaN(number2)) {
        throw Error('VALUE');
      }

      switch (type) {
        case '+':
          result = number1 + number2;
          break;
        case '-':
          result = number1 - number2;
          break;
        case '/':
          result = number1 / number2;
          if (result == Infinity) {
            throw Error('DIV_ZERO');
          } else if (isNaN(result)) {
            throw Error('VALUE');
          }
          break;
        case '*':
          result = number1 * number2;
          break;
        case '^':
          result = Math.pow(number1, number2);
          break;
      }

      return result;
    },

    /**
     * call function from formula
     * @param {String} fn
     * @param {Array} args
     * @returns {*}
     */
    callFunction: function (fn, args) {
      fn = fn.toUpperCase();
      args = args || [];

      if (instance.helper.SUPPORTED_FORMULAS.indexOf(fn) > -1) {
        if (instance.formulas[fn]) {
          return instance.formulas[fn].apply(this, args);
        }
      }

      throw Error('NAME');
    },

    /**
     * get variable from formula
     * @param {Array} args
     * @returns {*}
     */
    callVariable: function (args) {
      args = args || [];
      var str = args[0];

      if (str) {
        str = str.toUpperCase();
        if (instance.formulas[str]) {
          return ((typeof instance.formulas[str] === 'function') ? instance.formulas[str].apply(this, args) : instance.formulas[str]);
        }
      }

      throw Error('NAME');
    },

    /**
     * Get cell value
     * @param {String} cell => A1 AA1
     * @returns {*}
     */
    cellValue: function (cell) {
      var value,
        fnCellValue = instance.custom.cellValue,
        element = this,
        item = instance.matrix.getItem(cell);

      // check if custom cellValue fn exists
      if (instance.utils.isFunction(fnCellValue)) {

        var cellCoords = instance.utils.cellCoords(cell),
          cellId = instance.utils.translateCellCoords({row: element.row, col: element.col});

        // get value
        value = item ? item.value : fnCellValue(cellCoords.row, cellCoords.col);

        if (cellId) {
          //update dependencies
          instance.matrix.updateItem(cellId, {deps: [cell]});
        }

      } else {

        // get value
        value = item ? item.value : document.getElementById(cell).value;

        //update dependencies
        instance.matrix.updateElementItem(element, {deps: [cell]});

      }

      if (!instance.utils.isUndefined(value)) {
        return instance.helper.number(value);
      }

      throw Error('NOT_AVAILABLE');
    },

    /**
     * Get cell range values
     * @param {String} start cell A1
     * @param {String} end cell B3
     * @returns {Array}
     */
    cellRangeValue: function (start, end) {
      var fnCellValue = instance.custom.cellValue,
        coordsStart = instance.utils.cellCoords(start),
        coordsEnd = instance.utils.cellCoords(end),
        element = this;

      // iterate cells to get values and indexes
      var cells = instance.utils.iterateCells.call(this, coordsStart, coordsEnd),
        result = [];

      // check if custom cellValue fn exists
      if (instance.utils.isFunction(fnCellValue)) {

        var cellId = instance.utils.translateCellCoords({row: element.row, col: element.col});

        //update dependencies
        instance.matrix.updateItem(cellId, {deps: cells.index});

      } else {

        //update dependencies
        instance.matrix.updateElementItem(element, {deps: cells.index});
      }

      result.push(cells.value);
      return result;
    },

    /**
     * Get fixed cell value
     * @param {String} id
     * @returns {*}
     */
    fixedCellValue: function (id) {
      id = id.replace(/\$/g, '');
      return instance.helper.cellValue.call(this, id);
    },

    /**
     * Get fixed cell range values
     * @param {String} start
     * @param {String} end
     * @returns {Array}
     */
    fixedCellRangeValue: function (start, end) {
      start = start.replace(/\$/g, '');
      end = end.replace(/\$/g, '');

      return instance.helper.cellRangeValue.call(this, start, end);
    }
  };

  /**
   * parse input string using parser
   * @returns {Object} {{error: *, result: *}}
   * @param formula
   * @param element
   */
  var parse = function (formula, element) {
    var result = null,
      error = null;

    try {

      parser.setObj(element);
      result = parser.parse(formula);

//      var deps = instance.matrix.getElementDependencies(element),
//        id = element.getAttribute('id');
//
//      if (deps.indexOf(id) > -1) {
//        result = null;
//        throw Error('REF');
//      }

    } catch (ex) {

      var message = Exception.get(ex.message);

      if (message) {
        error = message;
      } else {
        error = Exception.get('ERROR');
      }

      //console.debug(ex.prop);
      //debugger;
      //error = ex.message;
      //error = Exception.get('ERROR');
    }

    return {
      error: error,
      result: result
    }
  };

  /**
   * initial method, create formulas, parser and matrix objects
   */
  var init = function () {
    instance = this;

    parser = new FormulaParser(instance);

    instance.formulas = Formula;
    instance.matrix = new Matrix();

    instance.custom = {};

    if (rootElement) {
      instance.matrix.scan();
    }
  };

  return {
    init: init,
    version: version,
    utils: utils,
    helper: helper,
    parse: parse,
    custom: null
  };

});