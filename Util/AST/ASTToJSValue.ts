const expFields = ["kind", "id", "label", "treatments"];
const ignoreFields = ["defaultConfig", "config"];

export function isEnumExpression(node: any): boolean {
  if (node.type !== "MemberExpression") return false;

  if (node.object.type === "MemberExpression" && !node.computed) {
    return isEnumExpression(node.object);
  }

  if (node.object.type === "Identifier" && !node.computed) {
    return node.property.type === "Identifier";
  }

  return false;
}

export function hasProperty(node: any, name: string) {
  if (node.type !== "ObjectExpression") throw new Error("Not an object");

  return node.properties.some((prop: any) => {
    if (!prop.key) return false;

    if (prop.key.type === "Identifier") {
      return prop.key.name === name;
    }

    if (prop.key.type === "Literal") {
      return prop.key.value === name;
    }

    return false;
  });
}

export function isExperiment(node: any): boolean {
  return expFields.every((prop) => hasProperty(node, prop));
}

export function astToJSValue(node: any): any {
  if (
    node.type === "Literal" ||
    node.type === "StringLiteral" ||
    node.type === "NumericLiteral"
  ) {
    return node.value;
  }

  if (node.type === "ObjectExpression") {
    const obj: Record<string, any> = {};

    for (const prop of node.properties) {
      if (!prop.key) continue;

      let name: string;
      if (prop.key.type === "Identifier") name = prop.key.name;
      else if (
        prop.key.type === "Literal" ||
        prop.key.type === "StringLiteral" ||
        prop.key.type === "NumericLiteral"
      ) {
        name = prop.key.value;
      } else {
        continue;
      }

      if (ignoreFields.includes(name)) continue;
      obj[name] = astToJSValue(prop.value);
    }

    return obj;
  }

  if (node.type === "ArrayExpression") {
    return node.elements.map((elem: any) => astToJSValue(elem));
  }

  if (node.type === "Identifier") {
    //return node.name
  }

  if (node.type === "UnaryExpression" && node.operator === "!") {
    return !astToJSValue(node.argument);
  }

  if (isEnumExpression(node)) {
    //return node.property.name
  }

  throw new Error(`Unsupported node type ${node.type}`);
  //return this.script.substring(node.start, node.end)
}