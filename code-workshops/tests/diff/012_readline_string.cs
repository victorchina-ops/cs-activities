using System;

class Program
{
    static void Main()
    {
        string name = Console.ReadLine();
        Console.WriteLine("Hello " + name + "!");
        Console.WriteLine(name.Length);
        string age = Console.ReadLine();
        Console.WriteLine(age + 1);
        Console.WriteLine(int.Parse(age) + 1);
    }
}
