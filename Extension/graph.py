from graphviz import Digraph

dot = Digraph(comment='function relationship')
names = []

def add_node(node):
    names.append(node)
    dot.node(node.name, node.name)

def assign():
    for i in (names):
        for j in i.supers:
            dot.edge(j.name, i.name, "calls")


def plot():
    dot.render('./dump_file/round-table.gv', view=True)

# ------------ example -----------------
# names = ['剪刀', '石頭', '布']
# for i in names:  #新增三個結點，分別叫做剪刀石頭布
#     dot.node(i, i)

# for i in range(len(names)): #將互相克制的關係畫上去
#     dot.edge(names[i], names[i-1], "克制")

# dot.node('a', 'a')
# dot.node('b', 'b')
# dot.edge('a', 'b', 'point to')

