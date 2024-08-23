import graph

file_name = "dump_file/hierarchy.txt"
class func:
    def __init__(self, name, file, line):
        self.name = name
        self.file = file
        self.line = line
        self.supers = set()
        self.infers = set()

    def add_super(self, super):
        for i in self.supers:
            if super == i:
                return False
        self.supers.add(super)
        return True
    
    def add_infer(self, infer):
        for i in self.infers:
            if infer == i:
                return False
            
        self.infers.add(infer)
        return True


def check_value(func, funcs):
    for i in funcs:
        if func.name == i.name and func.file == i.file and func.line == i.line:
            return False   
    return True

def get_index(func, funcs):
    for i in funcs:
        if func.name == i.name and func.file == i.file and func.line == i.line:
            return funcs.index(i)   
# def add_node(main):

file = []
funcs = []

with open(file_name, 'r') as f:
    for line in f:
        words = line.split('    ')
        # print(words)
        file.append(words)

# print("-------------------------------------")

counter = 0
for i in file:
    if counter%4 == 0:
        Name = ''
        File = ''
        Line = ''
        # print(len(i))
        Name = i[len(i) - 1]
        # print(Name, end="")
    elif counter%4 == 1:
        File = i[len(i) - 1]
        # print(File, end="")
    elif counter%4 == 2:
        Line = i[len(i) - 1]
        # print(Line, end = "")
    elif counter%4 == 3:
        print("", end="")
        if check_value(func(Name, File, Line), funcs):
            funcs.append(func(Name, File, Line))
        # print('------------------')
    counter+=1
    
# for i in funcs:
#     print(i.name, end="")
#     print(i.file, end="")
#     print(i.line, end="")
#     print("---------------")
# print(funcs)

stack = []
layer = 0
counter = 0
for i in file:
    if counter%4 == 0:
        Name = ''
        File = ''
        Line = ''
        Name = i[len(i) - 1]
    elif counter%4 == 1:
        File = i[len(i) - 1]
    elif counter%4 == 2:
        Line = i[len(i) - 1]
    elif counter%4 == 3:
        if len(i) > layer:
            if len(stack) >= 1:
                funcs[get_index(func(Name, File, Line), funcs)].add_super(stack[layer - 1])
                stack[layer - 1].add_infer(funcs[get_index(func(Name, File, Line), funcs)])
            stack.append(funcs[get_index(func(Name, File, Line), funcs)])
            layer+=1
        elif len(i) < layer:
            layer = len(i)
            del stack[layer:]
            stack[layer-1]=funcs[get_index(func(Name, File, Line), funcs)]
            if len(stack) >= 2:
                funcs[get_index(func(Name, File, Line), funcs)].add_super(stack[layer - 2])
                stack[layer - 2].add_infer(funcs[get_index(func(Name, File, Line), funcs)])

        elif len(i) == layer:
            stack[layer-1]=funcs[get_index(func(Name, File, Line), funcs)]
            funcs[get_index(func(Name, File, Line), funcs)].add_super(stack[layer - 2])
            stack[layer - 2].add_infer(funcs[get_index(func(Name, File, Line), funcs)])
        print("[", end="")
        for i in stack:
            print(i.name.replace("\n",""), end=" ")
        print("]")
    counter+=1


for i in funcs:
    print("main: " + i.name + "\nsupers: ")
    for j in i.supers:
        print(j.name, end="")
    print("\ninfers: ")
    for k in i.infers:
        print(k.name, end="")

    print("--------------------")

for i in funcs:
    graph.add_node(i)

graph.assign()
graph.plot()