import { ITool, ToolDefinition } from './ITool';

export class CalculatorTool implements ITool {
  definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'calculate',
      description: 'CRITICAL: You MUST absolutely use this tool whenever you need to perform ANY mathematical calculations. Do not attempt to calculate results in your head. A complete calculator that evaluates mathematical expressions. Supports standard operators (+, -, *, /, %, ^) and Math functions (e.g., Math.sin, Math.cos, Math.sqrt, Math.pow, Math.PI).',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: 'The mathematical expression to evaluate (e.g., "2 + 2", "Math.sqrt(16) * Math.PI", "100 * (1 + 0.05)").',
          },
        },
        required: ['expression'],
      },
    },
  };

  displayName = 'Calculator';
  displayDescription = 'Evaluates mathematical expressions.';
  enabledByDefault = true;

  async execute(args: Record<string, any>): Promise<string> {
    const { expression } = args;

    if (!expression || typeof expression !== 'string') {
      return 'Error: Please provide a valid mathematical expression as a string.';
    }

    try {
      //allow only safe characters
      const safePattern = /^[0-9+\-*/%().,\sMatha-zA-Z]+$/;
      if (!safePattern.test(expression)) {
         return 'Error: Expression contains invalid characters. Use only numbers, standard operators, and Math functions.';
      }
      
      //map ^ to ** for eval
      let toEvaluate = expression.replace(/\^/g, '**');

      const evaluate = new Function('Math', `return ${toEvaluate};`);
      const result = evaluate(Math);
      
      if (result === undefined || result === null || Number.isNaN(result)) {
         return `Error: Invalid expression or could not calculate result for "${expression}".`;
      }

      return String(result);
    } catch (e: any) {
      return `Error calculating "${expression}": ${e.message}`;
    }
  }
}
