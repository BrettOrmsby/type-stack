import { Scanner } from "../src/scan";
import { Parser } from "../src/parse";
import typeCheck from "../src/typeCheck";
import { standardLibraryFunctions } from "../src/functions";
import { TSError } from "../src/utils/error";

function check(input: string) {
    const scanner = new Scanner(input);
    const scanError = scanner.scan();
    expect(scanError).not.toBeInstanceOf(TSError);
    if(scanError instanceof TSError) {
        return;
    }
    const parser = new Parser(scanner.tokens, standardLibraryFunctions);
    const parseError = parser.parse();
    expect(parseError).not.toBeInstanceOf(TSError);
    if(parseError instanceof TSError) {
        return;
    }

    return typeCheck(parser.program, standardLibraryFunctions, parser.newFunctions)[0];
}

describe("Type check should check types before standard library functions", () => {
    test("Invalid function call on str type", () => {
        const input = "\"1\" \"2\" /";
        expect(check(input)).toBeInstanceOf(TSError);
    });
    test("Invalid custom function call on float type", () => {
        const input = `
    44.44 55.5 negate
    fn negate(t: int) @int {
        0 t -
    }`;
        expect(check(input)).toBeInstanceOf(TSError);
    });
    test("Valid custom function call on float type", () => {
        const input = `
    44.44 55.4 negate
    fn negate(t: float) @float {
        0 t -
    }`;
        expect(check(input)).not.toBeInstanceOf(TSError);
    });
    test("Invalid custom function with any type", () => {
        const input = `
    fn whatever(t: any) @any {
        0 t -
    }`;
        expect(check(input)).toBeInstanceOf(TSError);
    });
});