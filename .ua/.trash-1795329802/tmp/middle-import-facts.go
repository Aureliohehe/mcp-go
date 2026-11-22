package main

import (
    "encoding/json"
    "fmt"
    "go/ast"
    "go/parser"
    "go/token"
    "os"
    "strconv"
    "strings"
)

type Import struct{ Alias, Path string }
type Facts struct {
    Package string
    Imports []Import
    References map[string][]string
    Exports []string
}

func main() {
    var request struct {
        Files []struct {
            Path string
            Language string
        }
    }
    file, err := os.Open(".ua/intermediate/scan-result.json")
    if err != nil { panic(err) }
    if err := json.NewDecoder(file).Decode(&request); err != nil { panic(err) }
    if err := file.Close(); err != nil { panic(err) }
    output := map[string]Facts{}
    for _, entry := range request.Files {
        if entry.Language != "go" || !strings.HasSuffix(entry.Path, ".go") { continue }
        f, err := parser.ParseFile(token.NewFileSet(),entry.Path,nil,0)
        if f == nil {
            fmt.Fprintln(os.Stderr, err)
            continue
        }
        fact := Facts{Package:f.Name.Name, References:map[string][]string{}}
        for _, imp := range f.Imports {
            p, err := strconv.Unquote(imp.Path.Value)
            if err != nil {continue}
            alias := ""
            if imp.Name != nil { alias = imp.Name.Name }
            fact.Imports = append(fact.Imports, Import{Alias:alias, Path:p})
        }
        for name := range f.Scope.Objects {
            if ast.IsExported(name) { fact.Exports = append(fact.Exports,name) }
        }
        ast.Inspect(f, func(n ast.Node) bool {
            sel, ok := n.(*ast.SelectorExpr)
            if !ok || !ast.IsExported(sel.Sel.Name) { return true }
            id, ok := sel.X.(*ast.Ident)
            if ok && id.Obj == nil { fact.References[id.Name] = append(fact.References[id.Name],sel.Sel.Name) }
            return true
        })
        output[entry.Path]=fact
    }
    if err := json.NewEncoder(os.Stdout).Encode(output); err != nil { panic(err) }
}
