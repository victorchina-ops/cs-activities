using System;

class Program
{
    static void Main()
    {
        int x = int.Parse(Console.ReadLine());
        string r = x > 0 ? "pos" : x < 0 ? "neg" : "zero";
        Console.WriteLine(r);
        double d = x > 2 ? 1 : 2.5;
        Console.WriteLine(d);
        switch (x)
        {
            case 1: Console.WriteLine("one"); break;
            case 2:
            case 3: Console.WriteLine("two-three"); break;
            default: Console.WriteLine("other"); break;
        }
        switch ("b") { case "a": Console.WriteLine("A"); break; case "b": Console.WriteLine("B"); break; }
    }
}
