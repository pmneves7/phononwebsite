# Run from the repository root:
# julia --project=exporters/sunny exporters/sunny/examples/export_examples.jl
using SunnyMagnonExport
include("models.jl")

destination = isempty(ARGS) ? normpath(joinpath(@__DIR__, "../../../data/magnons")) : first(ARGS)
mkpath(destination)
for (file, example) in tutorial_examples()
    (; swt, path, units, name, repetitions, source_url) = example
    output = export_magnons(joinpath(destination, file * ".json"), swt, path; name, units, repetitions, source_url,
                            metadata=Dict("example_script" => "exporters/sunny/examples/models.jl"))
    println(output)
end
