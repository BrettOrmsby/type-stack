import { TokenType, Token, Pos } from "./scan.js";
import { type  StackFunction } from "./functions.js";
import { StackType } from "./stack.js";

type ExpressionType = TokenType.Int | TokenType.Float | TokenType.Str | TokenType.Bool | TokenType.Identifier | TokenType.Keyword;
type Expression = {
  type: ExpressionType;
  startPos: Pos;
  endPos: Pos;
  value: string | number | boolean;
}

enum StatementType {
    ForLoop,
    WhileLoop,
    Loop,
    If,
}

type Statement = {
    type: StatementType;
    block: Program;
    else?: Program;
}

export type Program = Array<Expression | Statement>

export class Parser {
    tokens: Token[];
    pointer: number;
    functions: Record<string, StackFunction>;
    newFunctions: string[];
    program: Program;

    constructor(tokens: Token[], functions: Record<string,  StackFunction>) {
        this.tokens = tokens;
        this.functions = functions;
        this.newFunctions = [];
        this.pointer = 0;
        this.program = [];
    }

    parse(): Error | void {
        const block = this.#parseStatement(true);
        if(block instanceof Error) {
            return block;
        }
        this.program = block;
        
        const posError = this.#checkFunctions();
        if(posError instanceof Error) {
            return posError;
        }
    }

    #parseStatement(isInRoot: boolean, isInLoop = false, isInIf = false, isInFunction = false): Error | Program {
        const startPos = this.#peek().startPos;
        if(!isInRoot) {
            this.#increment();
        }

        const block: Program = [];
        while(!this.#isAtEnd()) {
            const current = this.#peek();

            if([TokenType.OpenBracket, TokenType.CloseParen, TokenType.OpenParen, TokenType.Colon].includes(current.type)) {
                return new Error(`${current.startPos.line}:${current.startPos.char} Unexpected character: \`${current.value}\``);
            }

            if([TokenType.Int, TokenType.Float, TokenType.Str, TokenType.Bool, TokenType.Identifier].includes(current.type)) {
                block.push(current as Expression);
                this.#increment();
                continue;
            }

            if(TokenType.CloseBracket === current.type) {
                this.#increment();
                return block;
            }

            if(TokenType.Keyword === current.type) {
                if(["int", "bool", "str", "float"].includes(current.value as string)) {
                    block.push(current as Expression);
                    this.#increment();
                    continue;
                }

                if(["@int", "@bool", "@str", "@float", "@any"].includes(current.value as string)) {
                    return new Error(`${current.startPos.line}:${current.startPos.char} Unexpected keyword \`${current.value}\`. Keyword \`${current.value}\` must only be found after function declarations`);
                }

                if("else" === current.value) {
                    return new Error(`${current.startPos.line}:${current.startPos.char} Unexpected keyword \`else\`. Keyword \`else\` must only be found after an if statement`);
                }

                if("any" === current.value) {
                    if(isInFunction) {
                        block.push(current as Expression);
                        this.#increment();
                        continue;
                    } else {
                        return new Error(`${current.startPos.line}:${current.startPos.char} Unexpected keyword \`any\`. Keyword \`any\` must only be found in \`any\` functions`);
                    }
                }

                if("break" === current.value) {
                    if(isInLoop) {
                        block.push(current as Expression);
                        this.#increment();
                        continue;
                    } else {
                        return new Error(`${current.startPos.line}:${current.startPos.char} Unexpected keyword \`break\`. Keyword \`break\` must only be found in loops`);
                    }
                }

                if("continue" === current.value) {
                    if(isInLoop) {
                        block.push(current as Expression);
                        this.#increment();
                        continue;
                    } else {
                        return new Error(`${current.startPos.line}:${current.startPos.char} Unexpected keyword \`continue\`. Keyword \`continue\` must only be found in loops`);
                    }
                }

                if("loop" === current.value) {
                    if(!this.#expect(TokenType.OpenBracket)) {
                        return new Error(`${this.#peek().startPos.line}:${this.#peek().startPos.char} Expected an opening bracket (\`{\`) after a loop statement`);
                    }
                    const innerBlock = this.#parseStatement(false, isInIf,isInFunction, true);

                    if(innerBlock instanceof Error) {
                        return innerBlock;
                    }
                    
                    block.push({
                        type: StatementType.Loop,
                        block: innerBlock,
                    });
                    continue;
                }

                if("for" === current.value) {
                    if(!this.#expect(TokenType.Keyword, "loop")) {
                        return new Error(`${this.#peek().startPos.line}:${this.#peek().startPos.char} Expected a \`loop\` keyword after a \`for\` keyword`);
                    }
                    if(!this.#expect(TokenType.OpenBracket)) {
                        return new Error(`${this.#peek().startPos.line}:${this.#peek().startPos.char} Expected an opening bracket (\`{\`) after a for loop statement`);
                    }
                    const innerBlock = this.#parseStatement(false, isInIf,isInFunction, true);

                    if(innerBlock instanceof Error) {
                        return innerBlock;
                    }

                    block.push({
                        type: StatementType.ForLoop,
                        block: innerBlock,
                    });
                    continue;
                }

                if("while" === current.value) {
                    if(!this.#expect(TokenType.Keyword, "loop")) {
                        return new Error(`${this.#peek().startPos.line}:${this.#peek().startPos.char} Expected a \`loop\` keyword after a \`while\` keyword`);
                    }
                    if(!this.#expect(TokenType.OpenBracket)) {
                        return new Error(`${this.#peek().startPos.line}:${this.#peek().startPos.char} Expected an opening bracket (\`{\`) after a while loop statement`);
                    }
                    const innerBlock = this.#parseStatement(false,isInIf, isInFunction, true);

                    if(innerBlock instanceof Error) {
                        return innerBlock;
                    }
                    
                    block.push({
                        type: StatementType.WhileLoop,
                        block: innerBlock,
                    });
                    continue;
                }

                if("if" === current.value) {
                    if(!this.#expect(TokenType.OpenBracket)) {
                        return new Error(`${this.#peek().startPos.line}:${this.#peek().startPos.char} Expected an opening bracket (\`{\`) after an if statement`);
                    }
                    const innerBlock = this.#parseStatement(false, true, isInFunction, isInLoop);

                    if(innerBlock instanceof Error) {
                        return innerBlock;
                    }

                    this.pointer -= 1;
                    if(this.#expect(TokenType.Keyword, "else")) {
                        if(!this.#expect(TokenType.OpenBracket)) {
                            return new Error(`${this.#peek().startPos.line}:${this.#peek().startPos.char} Expected an opening bracket (\`{\`) after an else statement`);
                        }
                        
                        const elseBlock = this.#parseStatement(false, true, isInFunction, isInLoop);

                        if(elseBlock instanceof Error) {
                            return elseBlock;
                        }

                        block.push({
                            type: StatementType.If,
                            block: innerBlock,
                            else: elseBlock
                        });
                        continue;
                    }
                    block.push({
                        type: StatementType.If,
                        block: innerBlock,
                    });
                    continue;
                }

                if("fn" === current.value) {
                    if(!isInRoot) {
                        return new Error(`${current.startPos.line}:${current.startPos.char} Function declarations must not be nestles in other statements`);
                    }
                    if(!this.#expect(TokenType.Identifier)) {
                        return new Error(`${this.#peek().startPos.line}:${this.#peek().startPos.char} Expected a identifier after a \`fn\` keyword`);
                    }
                    const name = this.#peek().value as string;

                    if(!this.#expect(TokenType.OpenParen)) {
                        return new Error(`${this.#peek().startPos.line}:${this.#peek().startPos.char} Expected an opening parenthesis (\`(\`) after a function identifier`);
                    }

                    const parenStartPos = this.#peek().startPos;

                    const params: Record<string, StackType> = {};
                    
                    while(!this.#isAtEnd() && !this.#expect(TokenType.CloseParen)) {

                        this.pointer -= 1;
                        if(!this.#expect(TokenType.Identifier)) {
                            return new Error(`${this.#peek().startPos.line}:${this.#peek().startPos.char} Expected an identifier or parenthesis (\`(\`) after a opening parenthesis (\`(\`) of a function`);
                        }
                        const name = this.#peek().value as string;

                        if(this.#expect(TokenType.Colon)) {
                            this.#increment();
                            if(this.#peek().type === TokenType.Keyword && ["int", "str", "float", "bool", "any"].includes(this.#peek().value as string)) {
                                params[name] = {
                                    "int" : StackType.Int,
                                    "float" : StackType.Float,
                                    "str" : StackType.Str,
                                    "bool" : StackType.Bool,
                                    "any" : StackType.Any,
                                }[this.#peek().value as string];
                            }
                        } else {
                            this.pointer -= 1;
                            params[name] = StackType.Any;
                        }
                    }

                    if(this.#isAtEnd()) {
                        return new Error(`${parenStartPos.line}:${parenStartPos.char} Expected ending parenthesis pair`);
                    }

                    let functionType: StackType;

                    this.#increment();
                    if(!this.#isAtEnd() && this.#peek().type === TokenType.Keyword && ["@int", "@str", "@float", "@bool", "@any"].includes(this.#peek().value as string)) {
                        functionType = {
                            "@int" : StackType.Int,
                            "@float" : StackType.Float,
                            "@str" : StackType.Str,
                            "@bool" : StackType.Bool,
                            "@any" : StackType.Any,
                        }[this.#peek().value as string];
                    } else {
                        return new Error(`${this.#peek().startPos.line}:${this.#peek().startPos.char} Expected a function type (\`@int\`, \`@str\`, \`@float\`, \`@bool\`, \`@any\`) after a function declaration`);
                    }

                    if(!this.#expect(TokenType.OpenBracket)) {
                        return new Error(`${this.#peek().startPos.line}:${this.#peek().startPos.char} Expected an opening bracket (\`{\`) after a function declaration`);
                    }

                    const innerBlock = this.#parseStatement(false, isInIf, true, isInLoop);

                    if(innerBlock instanceof Error) {
                        return innerBlock;
                    }
                    
                    this.newFunctions.push(name);
                    this.functions[name] = {
                        stack: functionType,
                        params: params,
                        body: innerBlock
                    };
                    continue;
                }
            
                return new Error(`${current.startPos.line}:${current.startPos.char} Unknown keyword: \`${current.value}\``);
            }

            return new Error(`${current.startPos.line}:${current.startPos.char} Unknown token: \`${current.value}\``);
        }
        
        if(this.#isAtEnd() && !isInRoot) {
            return new Error(`${startPos.line}:${startPos.char} Expected ending bracket pair`);
        }

        return block;
    }

    #isAtEnd(): boolean {
        return this.pointer >= this.tokens.length;
    }
    #peek(): Token {
        if(this.#isAtEnd()) {
            const latestToken = this.tokens[this.pointer -1];
            return {
                type: TokenType.CloseBracket,
                startPos: {
                    line: latestToken.endPos.line,
                    char: latestToken.endPos.char +1
                },
                endPos: {
                    line: latestToken.endPos.line,
                    char: latestToken.endPos.char +1
                },
                value: ""
            };
        }
        return this.tokens[this.pointer];
    }
    #increment() {
        this.pointer += 1;
    }
    #expect(type: TokenType, value?: string): boolean {
        this.#increment();
        if(this.#isAtEnd()) {
            return false;
        }
        return this.#peek().type === type && (!value || (value && value === this.#peek().value));
    }

    #checkFunctions(): Error | void {
        const isValidCodeError = traverse.bind(this)(this.program, {}, StackType.Int);

        if(isValidCodeError instanceof Error) {
            return isValidCodeError;
        } 

        for(const fn of this.newFunctions) {
            const posError = traverse.bind(this)(this.functions[fn].body, this.functions[fn].params, this.functions[fn].stack);
            if(posError) {
                return posError;
            }
        }

        function traverse(program: Program, otherIdentifiers: Record<string, StackType>, stack: StackType): Error | void {
            for(const item of program) {
                // if it is an expression
                if("value" in item) {
                    if(item.type === TokenType.Identifier) {
                        const value = item.value as string;
                        if(value in otherIdentifiers) {
                            stack = otherIdentifiers[value];
                        } else if(value in this.functions) {
                            if(this.functions[value].stack !== stack && this.functions[value].stack !== StackType.Any) {
                                return new Error(`${item.startPos.line}:${item.startPos.char} Attempt to call function not found at stack ${stack}: \`${item.value}\``);
                            }
                        } else {
                            return new Error(`${item.startPos.line}:${item.startPos.char} Undeclared identifier: \`${item.value}\``);
                        }
                    } else if(item.type === TokenType.Keyword) {
                        switch(item.value as string) {
                        case "int":
                            stack = StackType.Int;
                            break;
                        case "float": 
                            stack = StackType.Float;
                            break;
                        case "str":
                            stack = StackType.Str;
                            break;
                        case "bool": 
                            stack = StackType.Bool;
                            break;
                        case "any": 
                            stack = StackType.Any;
                        }
                    } else if(item.type === TokenType.Int) {
                        stack = StackType.Int;
                    } else if(item.type === TokenType.Float) {
                        stack = StackType.Float;
                    } else if(item.type === TokenType.Str) {
                        stack = StackType.Str;
                    } else if(item.type === TokenType.Bool) {
                        stack = StackType.Bool;
                    }
                } else {
                    if(item.type === StatementType.Loop) {
                        const result = traverse.bind(this)(item.block, otherIdentifiers, stack);
                        if(result) {
                            return result;
                        }
                    } else if(item.type === StatementType.ForLoop) {
                        const result = traverse.bind(this)(item.block, otherIdentifiers, StackType.Int);
                        if(result) {
                            return result;
                        }
                        stack = StackType.Int;
                    } else if(item.type === StatementType.WhileLoop) {
                        const result = traverse.bind(this)(item.block, otherIdentifiers, StackType.Bool);
                        if(result) {
                            return result;
                        }
                        stack = StackType.Bool;
                    } else if(item.type === StatementType.If) {
                        const firstBlock = traverse.bind(this)(item.block, otherIdentifiers, StackType.Bool);
                        if(item.else) {
                            const secondBlock = traverse.bind(this)(item.block, otherIdentifiers, StackType.Bool);
                            if(secondBlock || firstBlock) {
                                return secondBlock || firstBlock;
                            }
                        } else {
                            if(firstBlock) {
                                return firstBlock;
                            }
                        }
                        stack = StackType.Bool;
                    } 
                }
                console.log(item, stack);
            }
        }
    }
}