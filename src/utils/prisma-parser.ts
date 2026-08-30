import { readFileSync } from 'fs';

export interface PrismaField {
  name: string;
  type: string;
  list?: boolean;
  optional?: boolean;
  attributes?: string[];
  default?: string | number | boolean;
  map?: string;
  relation?: {
    fields: string[];
    references: string[];
    onDelete?: 'Cascade' | 'SetNull' | 'Restrict' | 'NoAction';
    onUpdate?: 'Cascade' | 'SetNull' | 'Restrict' | 'NoAction';
  };
}

export interface PrismaModel {
  name: string;
  fields: PrismaField[];
  indexes?: string[][];
  unique?: string[][];
  map?: string;
}

export function extractModelsFromPrismaFile(filePath: string): PrismaModel[] {
  const schema = readFileSync(filePath, 'utf-8');
  return extractModelsFromString(schema);
}

export function extractModelsFromString(schema: string): PrismaModel[] {
  const models: PrismaModel[] = [];
  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
  
  let match;
  while ((match = modelRegex.exec(schema)) !== null) {
    const modelName = match[1];
    const modelBody = match[2];
    
    if (!modelName || !modelBody) continue;
    
    const model: PrismaModel = {
      name: modelName,
      fields: [],
    };
    
    const lines = modelBody.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    for (const line of lines) {
      if (line.startsWith('//')) continue;
      
      if (line.startsWith('@@index')) {
        const fieldsMatch = line.match(/@@index\(\[([^\]]+)\]\)/);
        if (fieldsMatch?.[1]) {
          const fields = fieldsMatch[1].split(',').map(f => f.trim());
          if (!model.indexes) model.indexes = [];
          model.indexes.push(fields);
        }
        continue;
      }
      
      if (line.startsWith('@@unique')) {
        const fieldsMatch = line.match(/@@unique\(\[([^\]]+)\]\)/);
        if (fieldsMatch?.[1]) {
          const fields = fieldsMatch[1].split(',').map(f => f.trim());
          if (!model.unique) model.unique = [];
          model.unique.push(fields);
        }
        continue;
      }
      
      if (line.startsWith('@@map')) {
        const mapMatch = line.match(/@@map\("([^"]+)"\)/);
        if (mapMatch?.[1]) {
          model.map = mapMatch[1];
        }
        continue;
      }
      
      const field = parseFieldLine(line);
      if (field) {
        model.fields.push(field);
      }
    }
    
    models.push(model);
  }
  
  return models;
}

function parseFieldLine(line: string): PrismaField | null {
  const parts = line.split(/\s+/);
  if (parts.length < 2) return null;
  
  const name = parts[0];
  if (!name) return null;
  
  let typeStr = parts[1];
  if (!typeStr) return null;
  
  const optional = typeStr.endsWith('?');
  if (optional) {
    typeStr = typeStr.slice(0, -1);
  }
  
  const list = typeStr.endsWith('[]');
  if (list) {
    typeStr = typeStr.slice(0, -2);
  }
  
  const field: PrismaField = {
    name,
    type: typeStr,
  };
  
  if (list) {
    field.list = true;
  }
  
  if (optional && !list) {
    field.optional = true;
  }
  
  const attributes = extractAttributes(line);
  if (attributes.length > 0) {
    field.attributes = attributes;
    
    for (const attr of attributes) {
      if (attr.startsWith('@default')) {
        const defaultValue = extractDefaultValue(attr);
        if (defaultValue !== undefined) {
          field.default = defaultValue;
        }
      }
      
      if (attr.startsWith('@map')) {
        const mapMatch = attr.match(/@map\("([^"]+)"\)/);
        if (mapMatch?.[1]) {
          field.map = mapMatch[1];
        }
      }
      
      if (attr.startsWith('@relation')) {
        field.relation = parseRelation(attr);
      }
    }
  }
  
  return field;
}

function extractAttributes(line: string): string[] {
  const attributes: string[] = [];
  let i = 0;
  let inAttribute = false;
  let currentAttr = '';
  let parenDepth = 0;
  
  while (i < line.length) {
    const char = line[i];
    
    if (char === '@' && parenDepth === 0 && !inAttribute) {
      if (currentAttr) {
        attributes.push(currentAttr.trim());
      }
      currentAttr = '@';
      inAttribute = true;
    } else if (inAttribute) {
      if (char === '(') {
        parenDepth++;
        currentAttr += char;
      } else if (char === ')') {
        parenDepth--;
        currentAttr += char;
        if (parenDepth === 0) {
          attributes.push(currentAttr);
          currentAttr = '';
          inAttribute = false;
        }
      } else if (char && parenDepth === 0 && /\s/.test(char)) {
        if (currentAttr.trim()) {
          attributes.push(currentAttr.trim());
        }
        currentAttr = '';
        inAttribute = false;
      } else {
        currentAttr += char;
      }
    }
    
    i++;
  }
  
  if (currentAttr && inAttribute) {
    attributes.push(currentAttr.trim());
  }
  
  return attributes;
}

function extractDefaultValue(attr: string): string | number | boolean | undefined {
  const match = attr.match(/@default\((.+)\)$/);
  if (!match || !match[1]) return undefined;
  
  const value = match[1].trim();
  
  if (value === 'true') return true;
  if (value === 'false') return false;
  
  if (/^-?\d+$/.test(value)) {
    return parseInt(value, 10);
  }
  if (/^-?\d+\.\d+$/.test(value)) {
    return parseFloat(value);
  }
  
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  
  return value;
}

type ReferentialAction = NonNullable<
  NonNullable<PrismaField['relation']>['onDelete']
>;

const REFERENTIAL_ACTIONS: readonly ReferentialAction[] = [
  'Cascade',
  'SetNull',
  'Restrict',
  'NoAction'
];

function toReferentialAction(value: string): ReferentialAction | undefined {
  return REFERENTIAL_ACTIONS.find((action) => action === value);
}

function parseRelation(attr: string): PrismaField['relation'] | undefined {
  const relation: PrismaField['relation'] = {
    fields: [],
    references: [],
  };
  
  const fieldsMatch = attr.match(/fields:\s*\[([^\]]+)\]/);
  if (fieldsMatch?.[1]) {
    relation.fields = fieldsMatch[1].split(',').map(f => f.trim());
  }
  
  const referencesMatch = attr.match(/references:\s*\[([^\]]+)\]/);
  if (referencesMatch?.[1]) {
    relation.references = referencesMatch[1].split(',').map(f => f.trim());
  }
  
  const onDeleteMatch = attr.match(/onDelete:\s*(\w+)/);
  if (onDeleteMatch?.[1]) {
    const value = toReferentialAction(onDeleteMatch[1]);
    if (value) {
      relation.onDelete = value;
    }
  }
  
  const onUpdateMatch = attr.match(/onUpdate:\s*(\w+)/);
  if (onUpdateMatch?.[1]) {
    const value = toReferentialAction(onUpdateMatch[1]);
    if (value) {
      relation.onUpdate = value;
    }
  }
  
  return relation;
}