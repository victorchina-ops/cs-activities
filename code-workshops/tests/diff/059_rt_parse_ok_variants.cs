using System;

class Program
{
    static void Main()
    {
        Console.WriteLine(int.Parse(" 12 ") + int.Parse("+5") + int.Parse("-3") + int.Parse("007"));
        Console.WriteLine(int.Parse("2147483647"));
        Console.WriteLine(int.Parse("-2147483648"));
        Console.WriteLine(double.Parse("1e3") + double.Parse(".5") + double.Parse("5.") + double.Parse("+2.5"));
        Console.WriteLine(double.Parse("3,5"));
        Console.WriteLine(double.Parse("-Infinity"));
    }
}
