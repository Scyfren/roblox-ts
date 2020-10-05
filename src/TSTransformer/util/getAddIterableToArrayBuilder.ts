import ts from "byots";
import luau from "LuauAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import {
	isArrayType,
	isDefinitelyType,
	isGeneratorType,
	isIterableFunctionLuaTupleType,
	isIterableFunctionType,
	isMapType,
	isSetType,
	isStringType,
} from "TSTransformer/util/types";

type AddIterableToArrayBuilder = (
	state: TransformState,
	expression: luau.Expression,
	arrayId: luau.AnyIdentifier,
	lengthId: luau.AnyIdentifier,
) => luau.Statement;

const addArray: AddIterableToArrayBuilder = (state, expression, arrayId, lengthId) => {
	const keyId = luau.tempId();
	const valueId = luau.tempId();
	return luau.create(luau.SyntaxKind.ForStatement, {
		ids: luau.list.make(keyId, valueId),
		expression: luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.ipairs,
			args: luau.list.make(expression),
		}),
		statements: luau.list.make(
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: arrayId,
					index: luau.binary(lengthId, "+", keyId),
				}),
				operator: "=",
				right: valueId,
			}),
		),
	});
};

const addString: AddIterableToArrayBuilder = (state, expression, arrayId, lengthId) => {
	const valueId = luau.tempId();
	return luau.create(luau.SyntaxKind.ForStatement, {
		ids: luau.list.make(valueId),
		expression: luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.string.gmatch,
			args: luau.list.make(expression, luau.globals.utf8.charpattern),
		}),
		statements: luau.list.make(
			luau.create(luau.SyntaxKind.Assignment, {
				left: lengthId,
				operator: "+=",
				right: luau.number(1),
			}),
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: arrayId,
					index: lengthId,
				}),
				operator: "=",
				right: valueId,
			}),
		),
	});
};

const addSet: AddIterableToArrayBuilder = (state, expression, arrayId, lengthId) => {
	const valueId = luau.tempId();
	return luau.create(luau.SyntaxKind.ForStatement, {
		ids: luau.list.make<luau.AnyIdentifier>(luau.emptyId(), valueId),
		expression: luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.pairs,
			args: luau.list.make(expression),
		}),
		statements: luau.list.make(
			luau.create(luau.SyntaxKind.Assignment, {
				left: lengthId,
				operator: "+=",
				right: luau.number(1),
			}),
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: arrayId,
					index: lengthId,
				}),
				operator: "=",
				right: valueId,
			}),
		),
	});
};

const addMap: AddIterableToArrayBuilder = (state, expression, arrayId, lengthId) => {
	const keyId = luau.tempId();
	const valueId = luau.tempId();
	const pairId = luau.tempId();
	return luau.create(luau.SyntaxKind.ForStatement, {
		ids: luau.list.make<luau.AnyIdentifier>(keyId, valueId),
		expression: luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.pairs,
			args: luau.list.make(expression),
		}),
		statements: luau.list.make<luau.Statement>(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: pairId,
				right: luau.array([keyId, valueId]),
			}),
			luau.create(luau.SyntaxKind.Assignment, {
				left: lengthId,
				operator: "+=",
				right: luau.number(1),
			}),
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: arrayId,
					index: lengthId,
				}),
				operator: "=",
				right: pairId,
			}),
		),
	});
};

const addIterableFunction: AddIterableToArrayBuilder = (state, expression, arrayId, lengthId) => {
	const valueId = luau.tempId();
	return luau.create(luau.SyntaxKind.ForStatement, {
		ids: luau.list.make<luau.AnyIdentifier>(valueId),
		expression,
		statements: luau.list.make<luau.Statement>(
			luau.create(luau.SyntaxKind.Assignment, {
				left: lengthId,
				operator: "+=",
				right: luau.number(1),
			}),
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: arrayId,
					index: lengthId,
				}),
				operator: "=",
				right: valueId,
			}),
		),
	});
};

const addIterableFunctionLuaTuple: AddIterableToArrayBuilder = (state, expression, arrayId, lengthId) => {
	const iterFuncId = state.pushToVar(expression);
	const valueId = luau.tempId();
	return luau.create(luau.SyntaxKind.WhileStatement, {
		condition: luau.bool(true),
		statements: luau.list.make<luau.Statement>(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: valueId,
				right: luau.array([
					luau.create(luau.SyntaxKind.CallExpression, {
						expression: iterFuncId,
						args: luau.list.make(),
					}),
				]),
			}),
			luau.create(luau.SyntaxKind.IfStatement, {
				condition: luau.binary(luau.unary("#", valueId), "==", luau.number(0)),
				statements: luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {})),
				elseBody: luau.list.make(),
			}),
			luau.create(luau.SyntaxKind.Assignment, {
				left: lengthId,
				operator: "+=",
				right: luau.number(1),
			}),
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: arrayId,
					index: lengthId,
				}),
				operator: "=",
				right: valueId,
			}),
		),
	});
};

const addGenerator: AddIterableToArrayBuilder = (state, expression, arrayId, lengthId) => {
	const iterId = luau.tempId();
	return luau.create(luau.SyntaxKind.ForStatement, {
		ids: luau.list.make<luau.AnyIdentifier>(iterId),
		expression: luau.property(convertToIndexableExpression(expression), "next"),
		statements: luau.list.make<luau.Statement>(
			luau.create(luau.SyntaxKind.IfStatement, {
				condition: luau.property(iterId, "done"),
				statements: luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {})),
				elseBody: luau.list.make(),
			}),
			luau.create(luau.SyntaxKind.Assignment, {
				left: lengthId,
				operator: "+=",
				right: luau.number(1),
			}),
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: arrayId,
					index: lengthId,
				}),
				operator: "=",
				right: luau.property(iterId, "value"),
			}),
		),
	});
};

export function getAddIterableToArrayBuilder(state: TransformState, type: ts.Type): AddIterableToArrayBuilder {
	if (isDefinitelyType(type, t => isArrayType(state, t))) {
		return addArray;
	} else if (isDefinitelyType(type, t => isStringType(t))) {
		return addString;
	} else if (isDefinitelyType(type, t => isSetType(state, t))) {
		return addSet;
	} else if (isDefinitelyType(type, t => isMapType(state, t))) {
		return addMap;
	} else if (isDefinitelyType(type, t => isIterableFunctionLuaTupleType(state, t))) {
		return addIterableFunctionLuaTuple;
	} else if (isDefinitelyType(type, t => isIterableFunctionType(state, t))) {
		return addIterableFunction;
	} else if (isDefinitelyType(type, t => isGeneratorType(state, t))) {
		return addGenerator;
	}
	assert(false, "Not implemented");
}
